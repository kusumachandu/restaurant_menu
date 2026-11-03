import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import crypto from 'node:crypto';
import { Admin, Customer, Dish, Image, ORDER_STATUSES, Order, OtpCode, Restaurant, Table, TableSession, WebhookEvent } from './models.js';
import { sendOtp, smsIsLive } from './sms.js';
import { checkWebhookUrl, emit, newSecret, retryEvent, sendTest } from './webhooks.js';
import { requireAuth, requireOwner, requireSuper, wrap } from './middleware.js';
import { PLAN_NAMES, featuresOf } from './plans.js';
import { makeCutout } from './cutout.js';
import { makeDepth } from './depth.js';
import { mlEnabled } from './ml.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const uploadModel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

// Lighting/appearance a dish is shown with. Ranges mirror LOOK_FIELDS in apps/web/lib/look.js.
const num = (min, max) => z.coerce.number().min(min).max(max).optional();
const lookSchema = z.object({
  brightness: num(0.2, 2.5),
  key: num(0, 4),
  ambient: num(0, 3),
  azimuth: num(-180, 180),
  elevation: num(-10, 90),
  warmth: num(0, 1),
  glow: num(0, 1.5),
  depth: num(0, 0.4),
  shine: num(0.2, 1),
  spin: num(0, 2),
});

const dishSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(600).default(''),
  price: z.coerce.number().min(0),
  category: z.string().trim().min(1).max(60).default('Mains'),
  veg: z.boolean().default(false),
  special: z.boolean().default(false),
  available: z.boolean().default(true),
  imageId: objectId.nullable().optional(),
  modelId: objectId.nullable().optional(), // optional real 3D model (.glb) used for AR
  sortOrder: z.coerce.number().default(0),
  look: lookSchema.nullable().optional(),
});
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().max(160).default(''),
  currency: z.string().max(4).default('₹'),
  orderHoldSeconds: z.coerce.number().int().min(0).max(300).optional(),
  customerCheckIn: z.boolean().optional(),
});

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3-40 letters, numbers or dashes');
const passwordSchema = z.string().min(8).max(100);

const publicSettings = (r) => ({ name: r.name, tagline: r.tagline, currency: r.currency });
const dishOut = (d, cut = { cutout: new Set(), depth: new Set() }) => ({
  ...d, _id: String(d._id), imageId: d.imageId ? String(d.imageId) : null, modelId: d.modelId ? String(d.modelId) : null,
  cutout: Boolean(d.imageId && cut.cutout.has(String(d.imageId))), // the photo has its background removed
  depth: Boolean(d.imageId && cut.depth.has(String(d.imageId))),   // the photo has a depth map
});
// Which of the dishes' photos have a cutout and a depth map (without loading the image data).
const cutoutIds = async (dishes) => {
  const ids = dishes.map((d) => d.imageId).filter(Boolean);
  const has = async (field) => new Set((await Image.find({ _id: { $in: ids }, [field]: { $ne: null } }).select('_id').lean()).map((i) => String(i._id)));
  const [cutout, depth] = await Promise.all([has('cutout'), has('depth')]);
  return { cutout, depth };
};

/* ---------- public ---------- */
router.get('/r/:slug/menu', wrap(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!restaurant) return res.status(404).json({ error: 'Menu not found' });
  const features = featuresOf(restaurant.plan);
  const dishes = await Dish.find({ restaurantId: restaurant._id, available: true })
    .sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  const categories = [...new Set(dishes.map((d) => d.category))];
  const cut = await cutoutIds(dishes);
  // A valid table token (from the table's QR code) switches ordering on for this visitor.
  const t = features.ordering && typeof req.query.t === 'string'
    ? await Table.findOne({ restaurantId: restaurant._id, token: req.query.t, active: true }).lean()
    : null;
  res.set('Cache-Control', 'public, max-age=20');
  res.json({
    slug: restaurant.slug,
    settings: publicSettings(restaurant),
    features: { view3d: features.view3d, ar: features.ar, ordering: features.ordering, checkIn: Boolean(features.ordering && restaurant.customerCheckIn) },
    table: t ? { label: t.label } : null,
    categories,
    dishes: dishes.map((d) => dishOut(features.lookEditor ? d : { ...d, look: null }, cut)),
  });
}));

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again in a few minutes.' } });

/* ---------- guest check-in (restaurants that ask guests for a verified mobile number) ---------- */
// Indian mobile numbers, with or without +91 / 0. Returns +91XXXXXXXXXX, or null when it is not a valid number.
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}
const maskPhone = (p) => `${p.slice(0, 3)} ${p.slice(3, 5)}•••••${p.slice(-3)}`;
const guestSecret = () => `${config.jwtSecret}:guest`;
const otpHash = (restaurantId, phone, code) => crypto.createHash('sha256').update(`${restaurantId}:${phone}:${code}:${config.jwtSecret}`).digest('hex');

// The guest's check-in lasts until their table is settled; a token for a closed session no longer works.
async function sessionFromToken(token, restaurantId) {
  if (!token) return null;
  try {
    const { sid } = jwt.verify(String(token), guestSecret());
    return await TableSession.findOne({ _id: sid, restaurantId, endedAt: null });
  } catch { return null; }
}

// Shared by the check-in routes: the restaurant must have check-in switched on, and the table must be real.
async function checkInContext(req) {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!restaurant || !featuresOf(restaurant.plan).ordering || !restaurant.customerCheckIn) return { error: [404, 'Check-in is not available'] };
  const table = await Table.findOne({ restaurantId: restaurant._id, token: String(req.body?.table || req.query.t || ''), active: true });
  if (!table) return { error: [400, 'This table is not valid. Please scan the QR code on your table again.'] };
  return { restaurant, table };
}

router.post('/r/:slug/checkin/otp', otpLimiter, wrap(async (req, res) => {
  const ctx = await checkInContext(req);
  if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });

  const recent = await OtpCode.find({ restaurantId: ctx.restaurant._id, phone }).sort({ createdAt: -1 }).limit(5).lean();
  if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < 30000) return res.status(429).json({ error: 'Please wait a few seconds before asking for another code.' });
  if (recent.length >= 4) return res.status(429).json({ error: 'Too many codes were requested for this number. Please try again in a few minutes.' });

  const code = String(crypto.randomInt(100000, 1000000));
  const saved = await OtpCode.create({ restaurantId: ctx.restaurant._id, phone, codeHash: otpHash(ctx.restaurant._id, phone, code), expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  try { await sendOtp(phone, code); } catch (e) {
    console.error('otp send failed:', e.message);
    await saved.deleteOne();
    return res.status(502).json({ error: 'We could not send the SMS right now. Please try again, or ask the staff.' });
  }
  // With the console provider (development) the code is also returned, so it can be tried without a phone.
  res.json({ ok: true, resendIn: 30, ...(smsIsLive() ? {} : { devCode: code }) });
}));

const verifySchema = z.object({
  table: z.string().min(1).max(64),
  phone: z.string().max(20),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  guests: z.coerce.number().int().min(1, 'Tell us how many people are seated').max(50),
  otherPhones: z.array(z.string().max(20)).max(20).default([]),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to share your details with the restaurant.' }) }),
});

router.post('/r/:slug/checkin/verify', otpLimiter, wrap(async (req, res) => {
  const ctx = await checkInContext(req);
  if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
  const body = verifySchema.parse(req.body);
  const { restaurant, table } = ctx;
  const phone = normalizePhone(body.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  const others = [];
  for (const raw of body.otherPhones.map((p) => p.trim()).filter(Boolean)) {
    const p = normalizePhone(raw);
    if (!p) return res.status(400).json({ error: `"${raw}" is not a valid mobile number.` });
    if (p !== phone && !others.includes(p)) others.push(p);
  }

  const otp = await OtpCode.findOne({ restaurantId: restaurant._id, phone, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp || otp.attempts >= 5) return res.status(400).json({ error: 'That code has expired. Please ask for a new one.' });
  const a = Buffer.from(otpHash(restaurant._id, phone, body.code)); const b = Buffer.from(otp.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await OtpCode.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    return res.status(400).json({ error: 'That code is not right. Please check it and try again.' });
  }
  await OtpCode.deleteMany({ restaurantId: restaurant._id, phone });

  // The same person opening the menu again at the same table continues their session instead of starting another.
  let session = await TableSession.findOne({ restaurantId: restaurant._id, tableId: table._id, phone, endedAt: null });
  const fresh = !session;
  const known = session ? [...session.otherPhones] : []; // numbers already counted for this visit
  if (session) { session.guests = body.guests; session.otherPhones = others; await session.save(); }
  else session = await TableSession.create({ restaurantId: restaurant._id, tableId: table._id, tableLabel: table.label, phone, guests: body.guests, otherPhones: others });
  const now = new Date();
  const visit = { $set: { lastGuests: body.guests, lastTable: table.label, lastVisitAt: now } };
  if (fresh) {
    await Customer.updateOne(
      { restaurantId: restaurant._id, phone },
      { $inc: { visits: 1 }, $set: { ...visit.$set, verified: true }, $setOnInsert: { firstVisitAt: now } }, { upsert: true });
  }
  // The other guests' numbers are saved as guests of their own, marked unverified (a number already verified stays verified).
  for (const p of others.filter((o) => !known.includes(o))) {
    await Customer.updateOne(
      { restaurantId: restaurant._id, phone: p },
      { $inc: { visits: 1 }, ...visit, $setOnInsert: { firstVisitAt: now, verified: false } }, { upsert: true });
  }
  if (fresh) {
    emit(restaurant._id, 'customer.checked_in', { sessionId: String(session._id), table: table.label, phone, guests: body.guests, otherPhones: others, checkedInAt: session.createdAt });
  }
  const token = jwt.sign({ sid: String(session._id) }, guestSecret(), { expiresIn: '1d' });
  res.json({ token, guests: session.guests, phone: maskPhone(phone) });
}));

// Lets the page check, when it opens, that the guest's earlier check-in still stands.
router.get('/r/:slug/checkin/session', wrap(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() }).select('_id');
  const session = restaurant && await sessionFromToken(req.get('x-guest-token'), restaurant._id);
  if (!session) return res.status(401).json({ error: 'Please check in again.' });
  res.json({ valid: true, guests: session.guests, phone: maskPhone(session.phone), table: session.tableLabel });
}));

const orderData = (o) => ({
  orderId: String(o._id), table: o.tableLabel, status: o.status, total: o.total, note: o.note || '',
  items: o.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
  customer: o.customerPhone ? { phone: o.customerPhone, guests: o.guests } : null, placedAt: o.createdAt,
});

const orderSchema = z.object({
  session: z.string().max(2000).optional(),
  table: z.string().min(1).max(64),
  note: z.string().trim().max(200).default(''),
  items: z.array(z.object({ dishId: objectId, qty: z.coerce.number().int().min(1).max(20) })).min(1).max(40),
});

// Prices come from the database, never from the customer's request.
router.post('/r/:slug/orders', orderLimiter, wrap(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!restaurant || !featuresOf(restaurant.plan).ordering) return res.status(404).json({ error: 'Ordering is not available' });
  const body = orderSchema.parse(req.body);
  const table = await Table.findOne({ restaurantId: restaurant._id, token: body.table, active: true });
  if (!table) return res.status(400).json({ error: 'This table is not valid. Please scan the QR code on your table again.' });

  const qtyById = new Map();
  for (const i of body.items) qtyById.set(i.dishId, Math.min(20, (qtyById.get(i.dishId) || 0) + i.qty));
  const dishes = await Dish.find({ _id: { $in: [...qtyById.keys()] }, restaurantId: restaurant._id, available: true }).lean();
  if (dishes.length !== qtyById.size) return res.status(400).json({ error: 'Some dishes are no longer available. Please review your cart.' });

  const items = dishes.map((d) => ({ dishId: d._id, name: d.name, price: d.price, qty: qtyById.get(String(d._id)), imageId: d.imageId || undefined }));
  // A restaurant that asks for check-in only takes orders from a guest whose verified session is open at this table.
  let session = null;
  if (restaurant.customerCheckIn) {
    session = await sessionFromToken(body.session, restaurant._id);
    if (!session || String(session.tableId) !== String(table._id)) {
      return res.status(401).json({ error: 'Please verify your mobile number to order.', code: 'checkin' });
    }
  }

  const hold = restaurant.orderHoldSeconds ?? 120;
  const order = await Order.create({
    restaurantId: restaurant._id, tableId: table._id, tableLabel: table.label, items, note: body.note,
    total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
    releaseAt: new Date(Date.now() + hold * 1000),
    ...(session ? { sessionId: session._id, customerPhone: session.phone, guests: session.guests } : {}),
  });
  emit(restaurant._id, 'order.placed', orderData(order));
  res.status(201).json({ _id: String(order._id), status: order.status, total: order.total, holdLeft: hold });
}));

// Lets the customer's phone follow its orders; the unguessable ids are the only key.
// Orders already paid are left out, which ends the table's session on the phone.
router.get('/r/:slug/orders', wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((id) => objectId.safeParse(id).success).slice(0, 30);
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() }).select('_id');
  if (!restaurant || !ids.length) return res.json([]);
  const found = await Order.find({ _id: { $in: ids }, restaurantId: restaurant._id, paidAt: null }).sort({ createdAt: 1 }).lean();
  // A cancelled order is shown for a minute so the guest sees it went through, then it is dropped (and forgotten by the phone).
  const orders = found.filter((o) => o.status !== 'cancelled' || Date.now() - new Date(o.cancelledAt || o.updatedAt).getTime() < 60000);
  res.json(orders.map((o) => ({
    _id: String(o._id), status: o.status, total: o.total, tableLabel: o.tableLabel, createdAt: o.createdAt, updatedAt: o.updatedAt,
    cancelledBy: o.cancelledBy,
    holdLeft: holdLeft(o), canCancel: holdLeft(o) > 0,
    items: o.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty, imageId: i.imageId ? String(i.imageId) : null })),
  })));
}));

// A new order is held back from the kitchen until releaseAt. Until then the guest can cancel it or send it early; after
// that only the staff can cancel it. Orders from before this existed have no releaseAt and count as already sent.
// Seconds of the hold left (0 once the kitchen can see the order).
const holdLeft = (o) => (o.status === 'new' && !o.paidAt && o.releaseAt ? Math.max(0, Math.ceil((new Date(o.releaseAt).getTime() - Date.now()) / 1000)) : 0);
const released = () => ({ $or: [{ releaseAt: null }, { releaseAt: { $lte: new Date() } }] });

// The check and the change are one atomic update, so the moment the hold ends exactly one of "cancel" and "sent" wins.
// The kitchen never saw the order, so there is nothing for it to acknowledge.
router.post('/r/:slug/orders/:id/cancel', orderLimiter, wrap(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ error: 'Order not found' });
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() }).select('_id');
  if (!restaurant) return res.status(404).json({ error: 'Order not found' });
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, restaurantId: restaurant._id, paidAt: null, status: 'new', releaseAt: { $gt: now } },
    { status: 'cancelled', cancelledBy: 'customer', cancelledAt: now, cancelAckAt: now },
    { new: true }
  );
  if (order) {
    emit(restaurant._id, 'order.cancelled', { ...orderData(order), cancelledBy: 'customer' });
    return res.json({ _id: String(order._id), status: order.status });
  }
  const current = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id }).select('status');
  if (!current) return res.status(404).json({ error: 'Order not found' });
  const why = current.status === 'cancelled' ? 'This order is already cancelled.'
    : 'This order has already been sent to the kitchen, so it can no longer be cancelled here. Please ask the staff.';
  res.status(409).json({ error: why });
}));

// "Send now": the guest is sure, so the kitchen gets the order without waiting for the hold to run out.
router.post('/r/:slug/orders/:id/send', orderLimiter, wrap(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ error: 'Order not found' });
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() }).select('_id');
  if (!restaurant) return res.status(404).json({ error: 'Order not found' });
  await Order.updateOne(
    { _id: req.params.id, restaurantId: restaurant._id, status: 'new', releaseAt: { $gt: new Date() } }, { releaseAt: new Date() });
  res.json({ ok: true });
}));

// Resized copies are small (10-40 KB) and cached in memory, so repeat requests skip Mongo and sharp.
const SIZES = [96, 240, 480, 800];
const variants = new Map();
const VARIANT_BUDGET = 24 * 1024 * 1024; // kept small: the API often runs on a 512 MB instance
sharp.cache({ memory: 32, files: 0, items: 32 }); // libvips otherwise keeps a lot of decoded images around
sharp.concurrency(1);
let variantBytes = 0;

function remember(key, buf) {
  variants.set(key, buf);
  variantBytes += buf.length;
  for (const [k, v] of variants) {
    if (variantBytes <= VARIANT_BUDGET) break;
    variants.delete(k);
    variantBytes -= v.length;
  }
}

router.get('/images/:id', wrap(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).end();
  const want = Number(req.query.w);
  const w = SIZES.find((s) => s >= want); // undefined => original size
  const cut = req.query.cut === '1';
  const depth = req.query.depth === '1';
  res.set('Cache-Control', 'public, max-age=31536000, immutable');

  const key = w ? `${req.params.id}:${depth ? 'd' : cut ? 'c' : 'p'}:${w}` : null;
  if (key && variants.has(key)) {
    const hit = variants.get(key);
    variants.delete(key); variants.set(key, hit); // refresh recency
    res.set('Content-Type', 'image/webp');
    return res.send(hit);
  }

  if (depth) {
    const d = await Image.findById(req.params.id).select('depth');
    if (!d?.depth) return res.status(404).end();
    res.set('Content-Type', 'image/webp');
    if (!w) return res.send(d.depth);
    const out = await sharp(d.depth).resize(w, w, { fit: 'inside' }).webp({ quality: 90 }).toBuffer();
    remember(key, out);
    return res.send(out);
  }
  const img = await Image.findById(req.params.id).select(cut ? 'cutout' : 'data contentType');
  if (!img || (cut && !img.cutout)) return res.status(404).end();
  if (cut) {
    res.set('Content-Type', 'image/webp');
    if (!w) return res.send(img.cutout);
    const out = await sharp(img.cutout).resize(w, w, { fit: 'inside' }).webp({ quality: 85, alphaQuality: 90 }).toBuffer();
    remember(key, out);
    return res.send(out);
  }
  if (!w || w >= 800 || !img.contentType.startsWith('image/')) {
    res.set('Content-Type', img.contentType);
    return res.send(img.data);
  }
  const out = await sharp(img.data).resize(w, w, { fit: 'cover' }).webp({ quality: 78 }).toBuffer();
  remember(key, out);
  res.set('Content-Type', 'image/webp');
  res.send(out);
}));

/* ---------- auth ---------- */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const admin = await Admin.findOne({ email: email.toLowerCase() });
  const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
  if (admin.role === 'owner') {
    const r = await Restaurant.findById(admin.restaurantId);
    if (!r || !r.active) return res.status(403).json({ error: 'This account is suspended. Please contact support.' });
  }
  const token = jwt.sign(
    { sub: String(admin._id), email: admin.email, role: admin.role, restaurantId: admin.restaurantId ? String(admin.restaurantId) : null },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  res.json({ token, role: admin.role });
}));

/* ---------- super admin (platform owner only) ---------- */
const sup = [requireAuth, requireSuper];

router.get('/super/restaurants', sup, wrap(async (req, res) => {
  const [restaurants, counts, tables, owners] = await Promise.all([
    Restaurant.find().sort({ createdAt: -1 }).lean(),
    Dish.aggregate([{ $group: { _id: '$restaurantId', n: { $sum: 1 } } }]),
    Table.aggregate([{ $group: { _id: '$restaurantId', n: { $sum: 1 } } }]),
    Admin.find({ role: 'owner' }).select('email restaurantId').lean(),
  ]);
  const tableCount = new Map(tables.map((c) => [String(c._id), c.n]));
  const dishCount = new Map(counts.map((c) => [String(c._id), c.n]));
  const ownerEmail = new Map(owners.map((o) => [String(o.restaurantId), o.email]));
  res.json({
    plans: PLAN_NAMES,
    restaurants: restaurants.map((r) => ({
      _id: String(r._id), slug: r.slug, name: r.name, plan: r.plan, active: r.active, extraTables: r.extraTables,
      tableCount: tableCount.get(String(r._id)) || 0, dishCount: dishCount.get(String(r._id)) || 0, ownerEmail: ownerEmail.get(String(r._id)) || '',
    })),
  });
}));

router.post('/super/restaurants', sup, wrap(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema,
    plan: z.enum(PLAN_NAMES).default('starter'),
    ownerEmail: z.string().email(),
    ownerPassword: passwordSchema,
  }).parse(req.body);
  if (await Admin.exists({ email: body.ownerEmail.toLowerCase() })) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const restaurant = await Restaurant.create({ name: body.name, slug: body.slug, plan: body.plan });
  try {
    await Admin.create({
      email: body.ownerEmail, passwordHash: await bcrypt.hash(body.ownerPassword, 12),
      role: 'owner', restaurantId: restaurant._id,
    });
  } catch (e) {
    await Restaurant.findByIdAndDelete(restaurant._id);
    throw e;
  }
  res.status(201).json({ _id: String(restaurant._id), slug: restaurant.slug });
}));

router.put('/super/restaurants/:id', sup, wrap(async (req, res) => {
  const data = z.object({
    plan: z.enum(PLAN_NAMES),
    active: z.boolean(),
    name: z.string().trim().min(1).max(80),
    extraTables: z.coerce.number().int().min(0).max(1000),
  }).partial().parse(req.body);
  const r = await Restaurant.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });
  res.json({ _id: String(r._id), plan: r.plan, active: r.active, name: r.name, extraTables: r.extraTables });
}));

router.post('/super/restaurants/:id/reset-password', sup, wrap(async (req, res) => {
  const { password } = z.object({ password: passwordSchema }).parse(req.body);
  const owner = await Admin.findOneAndUpdate(
    { role: 'owner', restaurantId: req.params.id },
    { passwordHash: await bcrypt.hash(password, 12) }
  );
  if (!owner) return res.status(404).json({ error: 'Owner not found' });
  res.status(204).end();
}));

/* ---------- restaurant owner ---------- */
const own = [requireAuth, requireOwner];

router.get('/admin/dishes', own, wrap(async (req, res) => {
  const dishes = await Dish.find({ restaurantId: req.restaurant._id }).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  const cut = await cutoutIds(dishes);
  res.json(dishes.map((d) => dishOut(d, cut)));
}));

const MODEL_TYPE = 'model/gltf-binary';

// Applies plan rules and makes sure the image belongs to this restaurant.
async function checkDishData(req, data) {
  if (!req.features.lookEditor) delete data.look;
  if (data.imageId && !(await Image.exists({ _id: data.imageId, restaurantId: req.restaurant._id }))) {
    throw new z.ZodError([{ code: 'custom', path: ['imageId'], message: 'Invalid image' }]);
  }
  if (data.modelId && !(await Image.exists({ _id: data.modelId, restaurantId: req.restaurant._id, contentType: MODEL_TYPE }))) {
    throw new z.ZodError([{ code: 'custom', path: ['modelId'], message: 'Invalid 3D model' }]);
  }
}

router.post('/admin/dishes', own, wrap(async (req, res) => {
  const { maxDishes } = req.features;
  if (maxDishes !== null && (await Dish.countDocuments({ restaurantId: req.restaurant._id })) >= maxDishes) {
    return res.status(403).json({ error: `Your ${req.features.label} plan allows up to ${maxDishes} dishes. Contact us to upgrade.` });
  }
  const data = dishSchema.parse(req.body);
  await checkDishData(req, data);
  const dish = await Dish.create({ ...data, restaurantId: req.restaurant._id });
  res.status(201).json(dish);
}));

router.put('/admin/dishes/:id', own, wrap(async (req, res) => {
  const data = dishSchema.partial().parse(req.body);
  await checkDishData(req, data);
  const existing = await Dish.findOne({ _id: req.params.id, restaurantId: req.restaurant._id });
  if (!existing) return res.status(404).json({ error: 'Dish not found' });
  const oldImage = existing.imageId ? String(existing.imageId) : null;
  const oldModel = existing.modelId ? String(existing.modelId) : null;
  existing.set(data);
  await existing.save();
  if (oldImage && 'imageId' in data && data.imageId !== oldImage) await Image.findByIdAndDelete(oldImage);
  if (oldModel && 'modelId' in data && data.modelId !== oldModel) await Image.findByIdAndDelete(oldModel);
  res.json(existing);
}));

router.delete('/admin/dishes/:id', own, wrap(async (req, res) => {
  const dish = await Dish.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurant._id });
  if (!dish) return res.status(404).json({ error: 'Dish not found' });
  if (dish.imageId) await Image.findByIdAndDelete(dish.imageId);
  if (dish.modelId) await Image.findByIdAndDelete(dish.modelId);
  res.status(204).end();
}));

// Square-crop and compress so every dish plate has the same shape.
router.post('/admin/upload', own, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image received' });
  let data;
  try {
    data = await sharp(req.file.buffer).rotate().resize(800, 800, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return res.status(400).json({ error: 'That file is not a valid image' });
  }
  let cutout = null;
  let tried = mlEnabled(); // while cutouts are off the photo is just saved; `npm run cutouts` (anywhere with more memory) does it later
  try { cutout = await makeCutout(data); } catch (e) { tried = false; console.warn('Cutout failed:', e.message); } // photo still works; `npm run cutouts` retries
  let depth = null;
  let depthTried = mlEnabled();
  try { depth = await makeDepth(data); } catch (e) { depthTried = false; console.warn('Depth failed:', e.message); }
  const img = await Image.create({ restaurantId: req.restaurant._id, data, contentType: 'image/jpeg', cutout, cutoutTried: tried, depth, depthTried });
  res.status(201).json({ imageId: String(img._id), cutout: Boolean(cutout), depth: Boolean(depth) });
}));

// Optional real 3D model of a dish (binary glTF), shown in AR on the customer's table.
router.post('/admin/upload-model', own, uploadModel.single('model'), wrap(async (req, res) => {
  if (!req.features.ar) return res.status(403).json({ error: 'AR is not included in your plan' });
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'No file received' });
  if (f.buffer.length < 12 || f.buffer.toString('ascii', 0, 4) !== 'glTF') {
    return res.status(400).json({ error: 'Please upload a .glb file (binary glTF)' });
  }
  const m = await Image.create({ restaurantId: req.restaurant._id, data: f.buffer, contentType: MODEL_TYPE });
  res.status(201).json({ modelId: String(m._id) });
}));

// Plan, slug and features are read-only here: owners cannot change them.
const tableLimitOf = (r) => { const f = featuresOf(r.plan); return f.ordering ? f.maxTables + r.extraTables : 0; };
const adminSettings = (r) => ({ ...publicSettings(r), orderHoldSeconds: r.orderHoldSeconds ?? 120, customerCheckIn: Boolean(r.customerCheckIn), smsLive: smsIsLive(), slug: r.slug, features: { ...featuresOf(r.plan), tableLimit: tableLimitOf(r) } });

router.get('/admin/settings', own, wrap(async (req, res) => {
  res.json(adminSettings(req.restaurant));
}));

router.put('/admin/settings', own, wrap(async (req, res) => {
  req.restaurant.set(settingsSchema.parse(req.body));
  await req.restaurant.save();
  res.json(adminSettings(req.restaurant));
}));

/* ---------- ordering (Pro plan) ---------- */
const needOrdering = (req, res, next) =>
  req.features.ordering ? next() : res.status(403).json({ error: 'Ordering is not included in your plan' });
const ordering = [...own, needOrdering];

router.get('/admin/tables', ordering, wrap(async (req, res) => {
  const tables = await Table.find({ restaurantId: req.restaurant._id }).sort({ createdAt: 1 }).lean();
  res.json({ limit: tableLimitOf(req.restaurant), tables: tables.map((t) => ({ ...t, _id: String(t._id) })) });
}));

router.post('/admin/tables', ordering, wrap(async (req, res) => {
  const { label } = z.object({ label: z.string().trim().max(40).optional() }).parse(req.body);
  const count = await Table.countDocuments({ restaurantId: req.restaurant._id });
  if (count >= tableLimitOf(req.restaurant)) {
    return res.status(403).json({ error: 'You have used all your tables. Contact us to add more.' });
  }
  const table = await Table.create({
    restaurantId: req.restaurant._id, label: label || `Table ${count + 1}`, token: crypto.randomBytes(9).toString('hex'),
  });
  res.status(201).json(table);
}));

router.put('/admin/tables/:id', ordering, wrap(async (req, res) => {
  const data = z.object({ label: z.string().trim().min(1).max(40), active: z.boolean() }).partial().parse(req.body);
  const table = await Table.findOneAndUpdate({ _id: req.params.id, restaurantId: req.restaurant._id }, data, { new: true });
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json(table);
}));

// New token = new QR code; the old printed one stops working.
router.post('/admin/tables/:id/regenerate', ordering, wrap(async (req, res) => {
  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurant._id },
    { token: crypto.randomBytes(9).toString('hex') },
    { new: true }
  );
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json(table);
}));

router.delete('/admin/tables/:id', ordering, wrap(async (req, res) => {
  const table = await Table.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurant._id });
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.status(204).end();
}));

// scope=open: orders on tables that haven't paid yet (oldest first), so a table's bill builds up.
// scope=done: the latest paid or cancelled orders; one settle gives all its orders the same paidAt.
router.get('/admin/orders', ordering, wrap(async (req, res) => {
  const open = req.query.scope !== 'done';
  // A cancellation by the guest stays on the open board until the kitchen acknowledges it, so it can't be missed.
  // Orders still in their cancel hold are not shown to the kitchen yet.
  const filter = open
    ? { paidAt: null, $and: [released(), { $or: [{ status: { $ne: 'cancelled' } }, { cancelledBy: 'customer', cancelAckAt: null }] }] }
    : { $or: [{ paidAt: { $ne: null } }, { status: 'cancelled' }] };
  const orders = await Order.find({ restaurantId: req.restaurant._id, ...filter })
    .sort(open ? { createdAt: 1 } : { updatedAt: -1 }).limit(300).lean();
  res.json(orders.map((o) => ({ ...o, _id: String(o._id), tableId: o.tableId ? String(o.tableId) : null })));
}));

router.post('/admin/orders/:id/ack', ordering, wrap(async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurant._id, status: 'cancelled', cancelAckAt: null }, { cancelAckAt: new Date() }, { new: true });
  res.json({ ok: true, acknowledged: Boolean(order) });
}));

// Settles a table: every unpaid, non-cancelled order on it is marked paid and leaves the open list.
router.post('/admin/tables/:id/settle', ordering, wrap(async (req, res) => {
  // An order the guest can still cancel isn't on the kitchen's list, so closing the table now would pay it unseen.
  const waiting = await Order.findOne({ restaurantId: req.restaurant._id, tableId: req.params.id, paidAt: null, status: 'new', releaseAt: { $gt: new Date() } }).select('releaseAt');
  if (waiting) {
    const secs = Math.ceil((new Date(waiting.releaseAt).getTime() - Date.now()) / 1000);
    return res.status(409).json({ error: `The guest just placed an order that reaches the kitchen in ${secs} seconds. Please close the table after that.` });
  }
  const filter = { restaurantId: req.restaurant._id, tableId: req.params.id, paidAt: null, status: { $ne: 'cancelled' } };
  const paying = await Order.find(filter).lean();
  const now = new Date();
  const result = await Order.updateMany(filter, { paidAt: now });
  // The guest's check-in ends with the bill, so the next people at this table check in themselves.
  const sessions = await TableSession.find({ restaurantId: req.restaurant._id, tableId: req.params.id, endedAt: null }).lean();
  await TableSession.updateMany({ _id: { $in: sessions.map((s) => s._id) } }, { endedAt: now });
  if (paying.length) {
    emit(req.restaurant._id, 'table.closed', {
      table: paying[0].tableLabel, total: paying.reduce((n, o) => n + o.total, 0), paidAt: now,
      customers: sessions.map((s) => ({ phone: s.phone, guests: s.guests })),
      orders: paying.map((o) => ({ orderId: String(o._id), total: o.total })),
    });
  }
  res.json({ settled: result.modifiedCount });
}));

/* ---------- guests and webhook (Pro plan) ---------- */
router.get('/admin/customers', ordering, wrap(async (req, res) => {
  const list = await Customer.find({ restaurantId: req.restaurant._id }).sort({ lastVisitAt: -1 }).limit(2000).lean();
  if (req.query.format === 'csv') {
    const rows = [['Mobile number', 'Verified by SMS', 'Visits', 'Last visit', 'Last table', 'Guests (last visit)', 'First visit'],
      ...list.map((c) => [c.phone, c.verified === false ? 'No' : 'Yes', c.visits, new Date(c.lastVisitAt).toISOString(), c.lastTable, c.lastGuests, new Date(c.firstVisitAt).toISOString()])];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="customers.csv"' });
    return res.send(rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n'));
  }
  res.json(list.map((c) => ({ _id: String(c._id), phone: c.phone, verified: c.verified !== false, visits: c.visits, lastGuests: c.lastGuests, lastTable: c.lastTable, firstVisitAt: c.firstVisitAt, lastVisitAt: c.lastVisitAt })));
}));

const webhookOut = (r) => ({ enabled: Boolean(r.webhook?.enabled), url: r.webhook?.url || '', secret: r.webhook?.secret || '' });

router.get('/admin/webhook', ordering, wrap(async (req, res) => {
  res.json(webhookOut(req.restaurant));
}));

router.put('/admin/webhook', ordering, wrap(async (req, res) => {
  const { enabled, url } = z.object({ enabled: z.boolean(), url: z.string().trim().max(500) }).parse(req.body);
  if (enabled || url) {
    const problem = checkWebhookUrl(url);
    if (problem) return res.status(400).json({ error: problem });
  }
  req.restaurant.webhook = { enabled: enabled && Boolean(url), url, secret: req.restaurant.webhook?.secret || newSecret() };
  await req.restaurant.save();
  res.json(webhookOut(req.restaurant));
}));

router.post('/admin/webhook/secret', ordering, wrap(async (req, res) => {
  req.restaurant.webhook = { ...webhookOut(req.restaurant), secret: newSecret() };
  await req.restaurant.save();
  res.json(webhookOut(req.restaurant));
}));

// Sends one test event right now, so the owner sees at once whether their address answers.
router.post('/admin/webhook/test', ordering, wrap(async (req, res) => {
  const hook = req.restaurant.webhook;
  if (!hook?.url) return res.status(400).json({ error: 'Save a webhook address first.' });
  const problem = checkWebhookUrl(hook.url);
  if (problem) return res.status(400).json({ error: problem });
  res.json(await sendTest(req.restaurant));
}));

router.get('/admin/webhook/events', ordering, wrap(async (req, res) => {
  const events = await WebhookEvent.find({ restaurantId: req.restaurant._id }).sort({ createdAt: -1 }).limit(30).lean();
  res.json(events.map((e) => ({ _id: String(e._id), type: e.type, status: e.status, attempts: e.attempts, lastStatus: e.lastStatus, lastError: e.lastError, createdAt: e.createdAt, sentAt: e.sentAt, nextAttemptAt: e.nextAttemptAt })));
}));

router.post('/admin/webhook/events/:id/retry', ordering, wrap(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ error: 'Event not found' });
  const ev = await retryEvent(req.restaurant._id, req.params.id);
  if (!ev) return res.status(404).json({ error: 'Only failed events can be retried.' });
  res.json({ ok: true });
}));

router.put('/admin/orders/:id', ordering, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(req.body);
  // Only forward moves are allowed, checked in the same update, so a cancelled order can't be started by a stale screen.
  const from = { preparing: ['new'], served: ['preparing'], cancelled: ['new', 'preparing'], new: [] }[status];
  const now = new Date();
  const set = { status };
  if (status === 'preparing') set.preparingAt = now;
  if (status === 'cancelled') Object.assign(set, { cancelledBy: 'kitchen', cancelledAt: now, cancelAckAt: now });
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurant._id, status: { $in: from } }, set, { new: true });
  if (order) {
    emit(req.restaurant._id, status === 'cancelled' ? 'order.cancelled' : 'order.status_changed', { ...orderData(order), ...(status === 'cancelled' ? { cancelledBy: 'kitchen' } : {}) });
    return res.json(order);
  }
  const current = await Order.findOne({ _id: req.params.id, restaurantId: req.restaurant._id }).select('status cancelledBy');
  if (!current) return res.status(404).json({ error: 'Order not found' });
  res.status(409).json({
    error: current.status === 'cancelled'
      ? (current.cancelledBy === 'customer' ? 'The customer just cancelled this order.' : 'This order is already cancelled.')
      : current.status === status ? `This order is already ${status}.` : `This order can't go from ${current.status} to ${status}.`,
  });
}));

export default router;
