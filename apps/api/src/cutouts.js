// Prepares dish photos uploaded before cutouts and depth maps existed: removes the background and estimates depth. Safe to re-run:
// it only touches photos that have no cutout yet. Usage: `npm run cutouts`.
import mongoose from 'mongoose';
import { config } from './config.js';
import { Dish, Image } from './models.js';
import { makeCutout } from './cutout.js';
import { makeDepth } from './depth.js';

await mongoose.connect(config.mongoUri);
const ids = (await Dish.find({ imageId: { $ne: null } }).select('imageId').lean()).map((d) => d.imageId);
const todo = await Image.find({
  _id: { $in: ids },
  $or: [{ cutout: null, cutoutTried: { $ne: true } }, { depth: null, depthTried: { $ne: true } }],
}).select('_id data cutout depth cutoutTried depthTried');
console.log(`${todo.length} photo(s) to process`);
for (const img of todo) {
  const id = img._id.toString();
  if (!img.cutout && !img.cutoutTried) {
    try {
      const cut = await makeCutout(img.data);
      await Image.updateOne({ _id: img._id }, { cutout: cut, cutoutTried: true });
      console.log(id, cut ? 'cut out' : 'no clear subject (keeps the full photo)');
    } catch (e) { console.log(id, 'cutout FAILED, will retry next run:', e.message); }
  }
  if (!img.depth && !img.depthTried) {
    try {
      const depth = await makeDepth(img.data);
      await Image.updateOne({ _id: img._id }, { depth, depthTried: true });
      console.log(id, depth ? 'depth map made' : 'depth estimation is off or not installed');
    } catch (e) { console.log(id, 'depth FAILED, will retry next run:', e.message); }
  }
}
await mongoose.disconnect();
