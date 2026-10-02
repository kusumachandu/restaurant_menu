import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { Admin, Dish, Image, getSettings } from './models.js';
import { requireAuth, wrap } from './middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

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
});
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().max(160).default(''),
  currency: z.string().max(4).default('₹'),
});

/* ---------- public ---------- */
router.get('/menu', wrap(async (req, res) => {
  const [settings, dishes] = await Promise.all([
    getSettings(),
    Dish.find({ available: true }).sort({ category: 1, sortOrder: 1, name: 1 }).lean(),
  ]);
  const categories = [...new Set(dishes.map((d) => d.category))];
  res.set('Cache-Control', 'public, max-age=20');
  res.json({
    settings: { name: settings.name, tagline: settings.tagline, currency: settings.currency },
    categories,
    dishes: dishes.map((d) => ({ ...d, _id: String(d._id), imageId: d.imageId ? String(d.imageId) : null })),
  });
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
  const token = jwt.sign({ sub: String(admin._id), email: admin.email }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
}));

/* ---------- admin ---------- */
router.use('/admin', requireAuth);

router.get('/admin/dishes', wrap(async (req, res) => {
  const dishes = await Dish.find().sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  res.json(dishes.map((d) => ({ ...d, _id: String(d._id), imageId: d.imageId ? String(d.imageId) : null })));
}));

router.post('/admin/dishes', wrap(async (req, res) => {
  const dish = await Dish.create(dishSchema.parse(req.body));
  res.status(201).json(dish);
}));

router.put('/admin/dishes/:id', wrap(async (req, res) => {
  const data = dishSchema.partial().parse(req.body);
  const existing = await Dish.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Dish not found' });
  const oldImage = existing.imageId ? String(existing.imageId) : null;
  existing.set(data);
  await existing.save();
  if (oldImage && 'imageId' in data && data.imageId !== oldImage) await Image.findByIdAndDelete(oldImage);
  res.json(existing);
}));

router.delete('/admin/dishes/:id', wrap(async (req, res) => {
  const dish = await Dish.findByIdAndDelete(req.params.id);
  if (!dish) return res.status(404).json({ error: 'Dish not found' });
  if (dish.imageId) await Image.findByIdAndDelete(dish.imageId);
  res.status(204).end();
}));

// Square-crop and compress so every dish plate has the same shape.
router.post('/admin/upload', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image received' });
  let data;
  try {
    data = await sharp(req.file.buffer).rotate().resize(800, 800, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return res.status(400).json({ error: 'That file is not a valid image' });
  }
  const img = await Image.create({ data, contentType: 'image/jpeg' });
  res.status(201).json({ imageId: String(img._id) });
}));

router.get('/admin/settings', wrap(async (req, res) => {
  const s = await getSettings();
  res.json({ name: s.name, tagline: s.tagline, currency: s.currency });
}));

router.put('/admin/settings', wrap(async (req, res) => {
  const s = await getSettings();
  s.set(settingsSchema.parse(req.body));
  await s.save();
  res.json({ name: s.name, tagline: s.tagline, currency: s.currency });
}));

export default router;
