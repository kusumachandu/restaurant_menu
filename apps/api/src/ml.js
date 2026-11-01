import { fork } from 'node:child_process';

// The cutout and depth models are heavy: each needs several hundred MB of RAM while it runs. On a small host
// (Render's 512 MB instances, for example) that crashes the whole API, so:
//   - they are OFF by default when running on Render or with NODE_ENV=production, and ON on a developer machine;
//   - set ENABLE_ML=1 to force them on (give the instance at least 2 GB), or ENABLE_ML=0 to force them off;
//   - photos uploaded while they are off are simply saved. Run `npm run cutouts` from a stronger machine (pointing
//     MONGODB_URI at the same database) to process them later.
export const mlEnabled = () => {
  if (process.env.ENABLE_ML === '1') return true;
  if (process.env.ENABLE_ML === '0') return false;
  return !process.env.RENDER && process.env.NODE_ENV !== 'production';
};

/**
 * A job runner backed by one child process, started on first use and stopped after `idleMs` without work, so the
 * memory the model needed goes back to the system. The child gets { id, jpeg (base64) } and answers
 * { id, result (base64 | null) } or { id, error }. Also keeps each model's own ONNX runtime out of this process:
 * the two models bundle different, incompatible versions of it.
 * @returns {(jpeg: Buffer) => Promise<Buffer|null>}
 */
export function createWorker(file, { idleMs = 60_000, timeoutMs = 180_000 } = {}) {
  let child = null;
  let seq = 0;
  let idle = null;
  const waiting = new Map();

  const failAll = (message) => {
    for (const { reject, timer } of waiting.values()) { clearTimeout(timer); reject(new Error(message)); }
    waiting.clear();
  };
  const armIdle = () => {
    clearTimeout(idle);
    if (waiting.size || !child) return;
    idle = setTimeout(() => child?.kill(), idleMs);
    idle.unref();
  };

  const start = () => {
    if (child) return child;
    child = fork(file, { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }); // not the parent's --watch flags
    child.on('message', ({ id, result, error }) => {
      const job = waiting.get(id);
      if (!job) return;
      waiting.delete(id);
      clearTimeout(job.timer);
      if (error) job.reject(new Error(error));
      else job.resolve(result ? Buffer.from(result, 'base64') : null);
      armIdle();
    });
    child.on('exit', () => { child = null; failAll('Worker stopped'); }); // the next job starts a fresh one
    child.on('error', (e) => { child = null; failAll(e.message); });
    child.unref(); // never keep the API alive just for this
    child.channel?.unref?.();
    return child;
  };

  return (jpeg) => new Promise((resolve, reject) => {
    clearTimeout(idle);
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Timed out')); child?.kill(); }, timeoutMs);
    waiting.set(id, { resolve, reject, timer });
    start().send({ id, jpeg: Buffer.from(jpeg).toString('base64') });
  });
}
