import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { config } from './config.js';
import { Restaurant } from './models.js';
import { featuresOf } from './plans.js';

export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

export function requireSuper(req, res, next) {
  if (req.admin?.role !== 'super') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Loads the owner's restaurant fresh from the database on every request, so a plan
// change or suspension made by the super admin takes effect immediately.
export const requireOwner = wrap(async (req, res, next) => {
  if (req.admin?.role !== 'owner' || !req.admin.restaurantId) return res.status(403).json({ error: 'Forbidden' });
  const restaurant = await Restaurant.findById(req.admin.restaurantId);
  if (!restaurant || !restaurant.active) return res.status(403).json({ error: 'This account is suspended' });
  req.restaurant = restaurant;
  req.features = featuresOf(restaurant.plan);
  next();
});

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid data', details: err.flatten().fieldErrors });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already in use' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image must be under 8 MB' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
