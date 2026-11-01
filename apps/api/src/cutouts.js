// Cuts the background out of dish photos uploaded before this feature existed. Safe to re-run:
// it only touches photos that have no cutout yet. Usage: `npm run cutouts`.
import mongoose from 'mongoose';
import { config } from './config.js';
import { Dish, Image } from './models.js';
import { makeCutout } from './cutout.js';

await mongoose.connect(config.mongoUri);
const ids = (await Dish.find({ imageId: { $ne: null } }).select('imageId').lean()).map((d) => d.imageId);
const todo = await Image.find({ _id: { $in: ids }, cutout: null, cutoutTried: { $ne: true } }).select('_id data');
console.log(`${todo.length} photo(s) to process`);
for (const img of todo) {
  try {
    const cut = await makeCutout(img.data);
    await Image.updateOne({ _id: img._id }, { cutout: cut, cutoutTried: true });
    console.log(img._id.toString(), cut ? 'cut out' : 'no clear subject (keeps the full photo)');
  } catch (e) {
    console.log(img._id.toString(), 'FAILED, will retry next run:', e.message);
  }
}
await mongoose.disconnect();
