import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Estimates how far each part of a dish photo is from the camera (a depth map: brighter = nearer), so the 3D view
// can raise the chicken leg out of the rice instead of guessing from the outline. Uses Depth Anything V2 (small, 8-bit)
// through @huggingface/transformers, an optional dependency: without it, or with DEPTH=off, dishes simply keep the
// outline-based shape. The model (about 25 MB) is downloaded on first use and cached in apps/api/.model-cache.
//
// The work runs in a separate process (depth-worker.js), started on first use and kept alive so the model loads once.
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'depth-worker.js');
const TIMEOUT = 120_000;

// Only checks that the package is there: loading it here would clash with the background-removal runtime.
const installed = () => { try { createRequire(import.meta.url).resolve('@huggingface/transformers'); return true; } catch { return false; } };

let child = null;
let seq = 0;
const waiting = new Map();

function failAll(message) {
  for (const { reject, timer } of waiting.values()) { clearTimeout(timer); reject(new Error(message)); }
  waiting.clear();
}

function worker() {
  if (child) return child;
  child = fork(workerPath, { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }); // not the parent's --watch flags
  child.on('message', ({ id, webp, error }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    clearTimeout(job.timer);
    if (error) job.reject(new Error(error)); else job.resolve(Buffer.from(webp, 'base64'));
  });
  child.on('exit', () => { child = null; failAll('Depth worker stopped'); }); // next call starts a fresh one
  child.on('error', (e) => { child = null; failAll(e.message); });
  child.unref();            // do not keep the API alive just for this
  child.channel?.unref?.();
  return child;
}

/**
 * @returns {Promise<Buffer|null>} a grayscale WebP depth map, or null when depth estimation is switched off or not installed.
 * Rejects if the model itself fails, so callers can tell "cannot" from "broken".
 */
export async function makeDepth(jpeg) {
  if (process.env.DEPTH === 'off') return null;
  if (!installed()) return null;
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Depth estimation timed out')); }, TIMEOUT);
    waiting.set(id, { resolve, reject, timer });
    worker().send({ id, jpeg: Buffer.from(jpeg).toString('base64') });
  });
}
