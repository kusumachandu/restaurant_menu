import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const Admin = model(
  'Admin',
  new Schema(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
    },
    { timestamps: true }
  )
);

// Images are stored in MongoDB so the project runs with no extra services.
// For a large menu, swap this for S3/Cloudinary and store the URL instead.
export const Image = model(
  'Image',
  new Schema({ data: Buffer, contentType: String }, { timestamps: true })
);

export const Dish = model(
  'Dish',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      description: { type: String, default: '' },
      price: { type: Number, required: true, min: 0 },
      category: { type: String, default: 'Mains', trim: true },
      veg: { type: Boolean, default: false },
      special: { type: Boolean, default: false },
      available: { type: Boolean, default: true },
      imageId: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
      sortOrder: { type: Number, default: 0 },
      look: { type: Schema.Types.Mixed, default: null }, // lighting settings, see routes.js
    },
    { timestamps: true }
  )
);

export const Settings = model(
  'Settings',
  new Schema({
    name: { type: String, default: 'My Restaurant' },
    tagline: { type: String, default: '' },
    currency: { type: String, default: '₹' },
  })
);

export async function getSettings() {
  return (await Settings.findOne()) || (await Settings.create({}));
}
