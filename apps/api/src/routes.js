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

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
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
const dishOut = (d) => ({ ...d, _id: String(d._id), imageId: d.imageId ? String(d.imageId) : null });

/* ---------- public ---------- */
router.get('/r/:slug/menu', wrap(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!restaurant) return res.status(404).json({ error: 'Menu not found' });
  const features = featuresOf(restaurant.plan);
  const dishes = await Dish.find({ restaurantId: restaurant._id, available: true })
    .sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  const categories = [...new Set(dishes.map((d) => d.category))];
  // A valid table token (from the table's QR code) switches ordering on for this visitor.
  const t = features.ordering && typeof req.query.t === 'string'
    ? await Table.findOne({ restaurantId: restaurant._id, token: req.query.t, active: true }).lean()
    : null;
  res.set('Cache-Control', 'public, max-age=20');
  res.json({
    slug: restaurant.slug,
    settings: publicSettings(restaurant),
    features: { view3d: features.view3d, ordering: features.ordering },
    table: t ? { label: t.label } : null,
    categories,
    dishes: dishes.map((d) => dishOut(features.lookEditor ? d : { ...d, look: null })),
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

router.get('/images/:id', wrap(async (req, res) => {
  const img = await Image.findById(req.params.id).select('data contentType');
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.contentType);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(img.data);
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
  res.json(dishes.map(dishOut));
}));

// Applies plan rules and makes sure the image belongs to this restaurant.
async function checkDishData(req, data) {
  if (!req.features.lookEditor) delete data.look;
  if (data.imageId && !(await Image.exists({ _id: data.imageId, restaurantId: req.restaurant._id }))) {
    throw new z.ZodError([{ code: 'custom', path: ['imageId'], message: 'Invalid image' }]);
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
  existing.set(data);
  await existing.save();
  if (oldImage && 'imageId' in data && data.imageId !== oldImage) await Image.findByIdAndDelete(oldImage);
  res.json(existing);
}));

router.delete('/admin/dishes/:id', own, wrap(async (req, res) => {
  const dish = await Dish.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurant._id });
  if (!dish) return res.status(404).json({ error: 'Dish not found' });
  if (dish.imageId) await Image.findByIdAndDelete(dish.imageId);
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
  const img = await Image.create({ restaurantId: req.restaurant._id, data, contentType: 'image/jpeg' });
  res.status(201).json({ imageId: String(img._id) });
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
