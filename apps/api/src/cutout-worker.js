// Runs in its own process (started by cutout.js through ml.js) and exits when idle.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

let lib;
const load = () => (lib ||= import('@imgly/background-removal-node'));

// The package looks for its model files relative to the working directory unless told where they are.
const publicPath = () => {
  try {
    const entry = createRequire(import.meta.url).resolve('@imgly/background-removal-node');
    return pathToFileURL(path.dirname(entry) + path.sep).href;
  } catch { return undefined; }
};

// A usable cutout has a real subject: not (nearly) all or none of the photo.
async function looksRight(png) {
  const a = await sharp(png).extractChannel('alpha').resize(64, 64, { fit: 'fill' }).raw().toBuffer();
  let on = 0;
  for (const v of a) if (v > 128) on++;
  const cover = on / a.length;
  return cover >= 0.2 && cover <= 0.97;
}

process.on('message', async ({ id, jpeg }) => {
  try {
    const mod = await load();
    const blob = await mod.removeBackground(new Blob([Buffer.from(jpeg, 'base64')], { type: 'image/jpeg' }), {
      publicPath: publicPath(), model: 'medium', output: { format: 'image/png' },
    });
    const png = Buffer.from(await blob.arrayBuffer());
    if (!(await looksRight(png))) return process.send({ id, result: null });
    const webp = await sharp(png).resize(640, 640, { fit: 'inside' }).webp({ quality: 88, alphaQuality: 92 }).toBuffer();
    process.send({ id, result: webp.toString('base64') });
  } catch (e) {
    process.send({ id, error: String(e?.message || e) });
  }
});
