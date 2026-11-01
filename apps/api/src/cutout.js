import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Cuts the dish out of its photo background so the 3D view can show just the food.
// Uses @imgly/background-removal-node (an optional dependency: without it, or with CUTOUT=off,
// dishes simply keep their full photo). Runs one photo at a time; a photo takes about 5 seconds.
let lib;
const load = () => (lib ||= import('@imgly/background-removal-node').catch(() => null));
// The package looks for its model files relative to the working directory unless told where they are.
const publicPath = () => {
  try {
    const entry = createRequire(import.meta.url).resolve('@imgly/background-removal-node');
    return pathToFileURL(path.dirname(entry) + path.sep).href;
  } catch { return undefined; }
};

let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

// A usable cutout has a real subject: not (nearly) all or none of the photo.
async function looksRight(png) {
  const a = await sharp(png).extractChannel('alpha').resize(64, 64, { fit: 'fill' }).raw().toBuffer();
  let on = 0;
  for (const v of a) if (v > 128) on++;
  const cover = on / a.length;
  return cover >= 0.2 && cover <= 0.97;
}

/**
 * @returns {Promise<Buffer|null>} a transparent WebP, or null when this photo has no clear subject (or cutouts are off).
 * Rejects if the cutout engine itself fails, so callers can tell "cannot" from "broken".
 */
export function makeCutout(jpeg) {
  if (process.env.CUTOUT === 'off') return Promise.resolve(null);
  return serial(async () => {
    const mod = await load();
    if (!mod) return null;
    const blob = await mod.removeBackground(new Blob([jpeg], { type: 'image/jpeg' }), {
      publicPath: publicPath(), model: 'medium', output: { format: 'image/png' },
    });
    const png = Buffer.from(await blob.arrayBuffer());
    if (!(await looksRight(png))) return null;
    return sharp(png).resize(640, 640, { fit: 'inside' }).webp({ quality: 88, alphaQuality: 92 }).toBuffer();
  });
}
