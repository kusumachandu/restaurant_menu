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
      // How long a new order is held back from the kitchen so the guest can still cancel it; 0 sends orders straight away.
      orderHoldSeconds: { type: Number, default: 120, min: 0, max: 300 },
      // When on, a guest must verify their mobile number (and say how many people are seated) before ordering.
      customerCheckIn: { type: Boolean, default: false },
      // Where this restaurant wants its events sent (check-ins, orders, ...). The secret signs every request.
      webhook: {
        enabled: { type: Boolean, default: false },
        url: { type: String, default: '' },
        secret: { type: String, default: '' },
      },
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
      depth: { type: Buffer, default: null },         // grayscale depth map (brighter = nearer), see depth.js
      depthTried: { type: Boolean, default: false },
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
      releaseAt: { type: Date, default: null }, // the kitchen sees the order from this time; until then the guest can cancel it
      preparingAt: { type: Date, default: null }, // when the kitchen started
      cancelledAt: { type: Date, default: null },
      cancelledBy: { type: String, enum: ['customer', 'kitchen', null], default: null },
      cancelAckAt: { type: Date, default: null }, // kitchen has seen a customer's cancellation
      sessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', default: null }, // set when the restaurant asks guests to check in
      customerPhone: { type: String, default: null }, // the verified number the order is linked to
      guests: { type: Number, default: null }, // people seated at the table, from the check-in
    },
    { timestamps: true }
  ).index({ restaurantId: 1, createdAt: -1 }).index({ createdAt: -1 }) // the dashboards read orders by date range (per restaurant, and platform-wide)
);

// A guest who verified their mobile number at a table. It lasts until the table is settled (paid), then a new guest checks in.
export const TableSession = model(
  'TableSession',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
      tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
      tableLabel: { type: String, required: true },
      phone: { type: String, required: true }, // verified, +91XXXXXXXXXX
      guests: { type: Number, required: true, min: 1, max: 50 },
      otherPhones: { type: [String], default: [] }, // optional numbers of the other people at the table, not verified
      endedAt: { type: Date, default: null },
    },
    { timestamps: true }
  ).index({ restaurantId: 1, createdAt: -1 }).index({ createdAt: -1 })
);

// One per phone number per restaurant: the guest list the restaurant can export.
export const Customer = model(
  'Customer',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
      phone: { type: String, required: true },
      visits: { type: Number, default: 0 },
      lastGuests: { type: Number, default: 1 },
      lastTable: { type: String, default: '' },
      verified: { type: Boolean, default: true }, // false for a number someone else at the table gave; it was not checked by SMS
      firstVisitAt: { type: Date, default: Date.now },
      lastVisitAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  ).index({ restaurantId: 1, phone: 1 }, { unique: true }).index({ restaurantId: 1, firstVisitAt: -1 }).index({ restaurantId: 1, lastVisitAt: -1 }).index({ firstVisitAt: -1 })
);

// A pending one-time code. Only a hash of the code is kept, and the record deletes itself shortly after it expires.
export const OtpCode = model(
  'OtpCode',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, required: true },
      phone: { type: String, required: true },
      codeHash: { type: String, required: true },
      attempts: { type: Number, default: 0 },
      expiresAt: { type: Date, required: true, index: { expires: 600 } }, // removed 10 minutes after expiry
    },
    { timestamps: true }
  ).index({ restaurantId: 1, phone: 1 })
);

// Events waiting to be sent to a restaurant's webhook. Saved first and sent by a background loop, so a slow or down
// receiver never holds up a guest, and nothing is lost if the API restarts.
export const WebhookEvent = model(
  'WebhookEvent',
  new Schema(
    {
      restaurantId: { type: Schema.Types.ObjectId, required: true, index: true },
      type: { type: String, required: true },
      payload: { type: Schema.Types.Mixed, required: true },
      status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: Date.now },
      lastStatus: { type: Number, default: null }, // HTTP status of the last try
      lastError: { type: String, default: '' },
      sentAt: { type: Date, default: null },
    },
    { timestamps: true }
  ).index({ status: 1, nextAttemptAt: 1 })
);
