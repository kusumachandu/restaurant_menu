import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createWorker, mlEnabled } from './ml.js';

// Cuts the dish out of its photo background so the 3D view can show just the food.
// Uses @imgly/background-removal-node (an optional dependency) in a separate process (cutout-worker.js) that exits
// when idle, to keep its memory off the API. A photo takes about 5 seconds. Off in production unless ENABLE_ML=1,
// and with CUTOUT=off; see ml.js.
const run = createWorker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cutout-worker.js'));

const installed = () => { try { createRequire(import.meta.url).resolve('@imgly/background-removal-node'); return true; } catch { return false; } };

let chain = Promise.resolve();
const serial = (fn) => {
  const job = chain.then(fn, fn);
  chain = job.catch(() => {});
  return job;
};

/**
 * @returns {Promise<Buffer|null>} a transparent WebP, or null when this photo has no clear subject or cutouts are
 * switched off. Rejects if the cutout engine itself fails, so callers can tell "cannot" from "broken".
 */
export function makeCutout(jpeg) {
  if (!mlEnabled() || process.env.CUTOUT === 'off' || !installed()) return Promise.resolve(null);
  return serial(() => run(jpeg));
}
