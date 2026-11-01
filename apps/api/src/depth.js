import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createWorker, mlEnabled } from './ml.js';

// Estimates how far each part of a dish photo is from the camera (a depth map: brighter = nearer), so the 3D view
// can raise the chicken leg out of the rice instead of guessing from the outline. Uses Depth Anything V2 (small, 8-bit)
// through @huggingface/transformers, an optional dependency, in a separate process (depth-worker.js) that exits when
// idle. The model (about 25 MB) is downloaded on first use and cached in apps/api/.model-cache. Off in production
// unless ENABLE_ML=1, and with DEPTH=off; see ml.js.
const run = createWorker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'depth-worker.js'));

const installed = () => { try { createRequire(import.meta.url).resolve('@huggingface/transformers'); return true; } catch { return false; } };

let chain = Promise.resolve();
const serial = (fn) => {
  const job = chain.then(fn, fn);
  chain = job.catch(() => {});
  return job;
};

/**
 * @returns {Promise<Buffer|null>} a grayscale WebP depth map, or null when depth estimation is switched off or not
 * installed. Rejects if the model itself fails, so callers can tell "cannot" from "broken".
 */
export function makeDepth(jpeg) {
  if (!mlEnabled() || process.env.DEPTH === 'off' || !installed()) return Promise.resolve(null);
  return serial(() => run(jpeg));
}
