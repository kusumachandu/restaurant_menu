import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import crypto from 'node:crypto';
import { Admin, Dish, Image, ORDER_STATUSES, Order, Restaurant, Table } from './models.js';
import { requireAuth, requireOwner, requireSuper, wrap } from './middleware.js';
import { PLAN_NAMES, featuresOf } from './plans.js';
import { makeCutout } from './cutout.js';

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
});

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3-40 letters, numbers or dashes');
const passwordSchema = z.string().min(8).max(100);

const publicSettings = (r) => ({ name: r.name, tagline: r.tagline, currency: r.currency });
const dishOut = (d, cut = new Set()) => ({
  ...d, _id: String(d._id), imageId: d.imageId ? String(d.imageId) : null, modelId: d.modelId ? String(d.modelId) : null,
  cutout: Boolean(d.imageId && cut.has(String(d.imageId))), // the photo has its background removed
});
// Ids of the dishes' photos that have a cutout (without loading the image data).
const cutoutIds = async (dishes) => new Set(
  (await Image.find({ _id: { $in: dishes.map((d) => d.imageId).filter(Boolean) }, cutout: { $ne: null } }).select('_id').lean()).map((i) => String(i._id))
);

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
    features: { view3d: features.view3d, ar: features.ar, ordering: features.ordering },
    table: t ? { label: t.label } : null,
    categories,
    dishes: dishes.map((d) => dishOut(features.lookEditor ? d : { ...d, look: null }, cut)),
  });
}));

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const orderSchema = z.object({
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
  const order = await Order.create({
    restaurantId: restaurant._id, tableId: table._id, tableLabel: table.label, items, note: body.note,
    total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
  });
  res.status(201).json({ _id: String(order._id), status: order.status, total: order.total });
}));

// Lets the customer's phone follow its orders; the unguessable ids are the only key.
// Orders already paid are left out, which ends the table's session on the phone.
router.get('/r/:slug/orders', wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((id) => objectId.safeParse(id).success).slice(0, 30);
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() }).select('_id');
  if (!restaurant || !ids.length) return res.json([]);
  const orders = await Order.find({ _id: { $in: ids }, restaurantId: restaurant._id, paidAt: null }).sort({ createdAt: 1 }).lean();
  res.json(orders.map((o) => ({
    _id: String(o._id), status: o.status, total: o.total, tableLabel: o.tableLabel,
    items: o.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty, imageId: i.imageId ? String(i.imageId) : null })),
  })));
}));

// Resized copies are small (10-40 KB) and cached in memory, so repeat requests skip Mongo and sharp.
const SIZES = [96, 240, 480, 800];
const variants = new Map();
const VARIANT_BUDGET = 64 * 1024 * 1024;
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
  res.set('Cache-Control', 'public, max-age=31536000, immutable');

  const key = w ? `${req.params.id}:${cut ? 'c' : 'p'}:${w}` : null;
  if (key && variants.has(key)) {
    const hit = variants.get(key);
    variants.delete(key); variants.set(key, hit); // refresh recency
    res.set('Content-Type', 'image/webp');
    return res.send(hit);
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
  let tried = true;
  try { cutout = await makeCutout(data); } catch (e) { tried = false; console.warn('Cutout failed:', e.message); } // photo still works; `npm run cutouts` retries
  const img = await Image.create({ restaurantId: req.restaurant._id, data, contentType: 'image/jpeg', cutout, cutoutTried: tried });
  res.status(201).json({ imageId: String(img._id), cutout: Boolean(cutout) });
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
const adminSettings = (r) => ({ ...publicSettings(r), slug: r.slug, features: { ...featuresOf(r.plan), tableLimit: tableLimitOf(r) } });

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
  const filter = open
    ? { paidAt: null, status: { $ne: 'cancelled' } }
    : { $or: [{ paidAt: { $ne: null } }, { status: 'cancelled' }] };
  const orders = await Order.find({ restaurantId: req.restaurant._id, ...filter })
    .sort(open ? { createdAt: 1 } : { updatedAt: -1 }).limit(300).lean();
  res.json(orders.map((o) => ({ ...o, _id: String(o._id), tableId: o.tableId ? String(o.tableId) : null })));
}));

// Settles a table: every unpaid, non-cancelled order on it is marked paid and leaves the open list.
router.post('/admin/tables/:id/settle', ordering, wrap(async (req, res) => {
  const result = await Order.updateMany(
    { restaurantId: req.restaurant._id, tableId: req.params.id, paidAt: null, status: { $ne: 'cancelled' } },
    { paidAt: new Date() }
  );
  res.json({ settled: result.modifiedCount });
}));

router.put('/admin/orders/:id', ordering, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(req.body);
  const order = await Order.findOneAndUpdate({ _id: req.params.id, restaurantId: req.restaurant._id }, { status }, { new: true });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

export default router;
