// Creates the admin account and a few sample dishes (without photos).
// Usage: set ADMIN_EMAIL and ADMIN_PASSWORD in apps/api/.env, then `npm run seed`.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { Admin, Dish, getSettings } from './models.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD first');
if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');

await mongoose.connect(config.mongoUri);
const passwordHash = await bcrypt.hash(password, 12);
await Admin.findOneAndUpdate({ email: email.toLowerCase() }, { email, passwordHash }, { upsert: true });
await getSettings();

if ((await Dish.countDocuments()) === 0) {
  await Dish.insertMany([
    { name: 'Chicken Dum Biryani', description: 'Basmati rice layered with marinated chicken and fried onions.', price: 299, category: 'Biryani', special: true },
    { name: 'Veg Biryani', description: 'Seasonal vegetables cooked with saffron rice.', price: 229, category: 'Biryani', veg: true },
    { name: 'Paneer Tikka', description: 'Charred paneer cubes with mint chutney.', price: 199, category: 'Starters', veg: true },
  ]);
}
console.log('Seed complete. Log in at /admin/login with', email);
await mongoose.disconnect();
