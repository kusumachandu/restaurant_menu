import mongoose from 'mongoose';
import { PLAN_NAMES } from './plans.js';

const { Schema, model } = mongoose;

// One document per client restaurant. `plan` and `active` are only writable through /api/super.
export const Restaurant = model(
  'Restaurant',
  new Schema(
    {
      slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
      name: { type: String, default: 'My Restaurant' },
      tagline: { type: String, default: '' },
      currency: { type: String, default: '₹' },
      plan: { type: String, enum: PLAN_NAMES, default: 'starter' },
      extraTables: { type: Number, default: 0, min: 0 }, // paid tables beyond the plan's, set by the super admin
      active: { type: Boolean, default: true },
    },
    { timestamps: true }
  )
);

// role 'owner' belongs to one restaurant; role 'super' is the platform owner and has no restaurant.
export const Admin = model(
  'Admin',
  new Schema(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ['owner', 'super'], default: 'owner' },
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', default: null },
    },
    { timestamps: true }
  )
);

// Images are stored in MongoDB so the project runs with no extra services.
// For a large menu, swap this for S3/Cloudinary and store the URL instead.
export const Image = model(
  'Image',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', index: true },
      data: Buffer,
      contentType: String,
      cutout: { type: Buffer, default: null },        // transparent WebP of just the dish, see cutout.js
      cutoutTried: { type: Boolean, default: false }, // so the backfill does not retry photos that cannot be cut out
    },
    { timestamps: true }
  )
);

export const Dish = model(
  'Dish',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
      name: { type: String, required: true, trim: true },
      description: { type: String, default: '' },
      price: { type: Number, required: true, min: 0 },
      category: { type: String, default: 'Mains', trim: true },
      veg: { type: Boolean, default: false },
      special: { type: Boolean, default: false },
      available: { type: Boolean, default: true },
      imageId: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
      modelId: { type: Schema.Types.ObjectId, ref: 'Image', default: null }, // optional .glb for AR
      sortOrder: { type: Number, default: 0 },
      look: { type: Schema.Types.Mixed, default: null }, // lighting settings, see routes.js
    },
    { timestamps: true }
  )
);

// A physical table. Its QR code carries `token`, which proves the order comes from a real table.
export const Table = model(
  'Table',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
      label: { type: String, required: true, trim: true },
      token: { type: String, required: true, unique: true },
      active: { type: Boolean, default: true },
    },
    { timestamps: true }
  )
);

export const ORDER_STATUSES = ['new', 'preparing', 'served', 'cancelled'];

// Item names and prices are copied in at order time so later menu edits don't change past orders.
export const Order = model(
  'Order',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
      tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
      tableLabel: { type: String, required: true },
      items: [{ _id: false, dishId: Schema.Types.ObjectId, name: String, price: Number, qty: Number, imageId: Schema.Types.ObjectId }],
      note: { type: String, default: '' },
      total: { type: Number, required: true },
      status: { type: String, enum: ORDER_STATUSES, default: 'new' },
      paidAt: { type: Date, default: null }, // set when the table's bill is settled
    },
    { timestamps: true }
  )
);
