// Sets up the platform owner (super admin) and a default restaurant. Safe to re-run.
// Also migrates data from the old single-restaurant layout into the default restaurant.
// Usage: set the variables below in apps/api/.env, then `npm run seed`.
//   SUPER_EMAIL / SUPER_PASSWORD   you, the platform owner (manages plans)
//   ADMIN_EMAIL / ADMIN_PASSWORD   the default restaurant's owner login
//   DEFAULT_SLUG                   default restaurant's menu address (default: demo)
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { Admin, Dish, Image, Restaurant } from './models.js';

const { SUPER_EMAIL, SUPER_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const slug = (process.env.DEFAULT_SLUG || 'demo').toLowerCase();
if (!SUPER_EMAIL || !SUPER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Set SUPER_EMAIL, SUPER_PASSWORD, ADMIN_EMAIL and ADMIN_PASSWORD first');
}
if (SUPER_PASSWORD.length < 8 || ADMIN_PASSWORD.length < 8) throw new Error('Passwords must be at least 8 characters');

await mongoose.connect(config.mongoUri);

// Default restaurant, carrying over name/tagline/currency from the old single `settings` document.
let restaurant = await Restaurant.findOne({ slug });
if (!restaurant) {
  const old = await mongoose.connection.collection('settings').findOne({});
  restaurant = await Restaurant.create({
    slug, plan: 'pro',
    ...(old && { name: old.name, tagline: old.tagline, currency: old.currency }),
  });
}

// Anything created before multi-restaurant support belongs to the default restaurant.
const noOwner = { restaurantId: { $exists: false } };
await Promise.all([
  Dish.updateMany(noOwner, { restaurantId: restaurant._id }),
  Image.updateMany(noOwner, { restaurantId: restaurant._id }),
]);

await Admin.findOneAndUpdate(
  { email: SUPER_EMAIL.toLowerCase() },
  { email: SUPER_EMAIL, passwordHash: await bcrypt.hash(SUPER_PASSWORD, 12), role: 'super', restaurantId: null },
  { upsert: true }
);
await Admin.findOneAndUpdate(
  { email: ADMIN_EMAIL.toLowerCase() },
  { email: ADMIN_EMAIL, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'owner', restaurantId: restaurant._id },
  { upsert: true }
);

if ((await Dish.countDocuments({ restaurantId: restaurant._id })) === 0) {
  await Dish.insertMany([
    { name: 'Chicken Dum Biryani', description: 'Basmati rice layered with marinated chicken and fried onions.', price: 299, category: 'Biryani', special: true },
    { name: 'Veg Biryani', description: 'Seasonal vegetables cooked with saffron rice.', price: 229, category: 'Biryani', veg: true },
    { name: 'Paneer Tikka', description: 'Charred paneer cubes with mint chutney.', price: 199, category: 'Starters', veg: true },
  ].map((d) => ({ ...d, restaurantId: restaurant._id })));
}
console.log(`Seed complete.\n  Super admin: ${SUPER_EMAIL}  ->  /admin/login (opens /super)\n  Restaurant "${slug}" owner: ${ADMIN_EMAIL}\n  Menu: /r/${slug}`);
await mongoose.disconnect();
