// Runs in its own process (started by depth.js). The depth model and the background-removal model each bundle their
// own ONNX runtime, and two different versions cannot live in one process, so depth estimation is kept apart.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
let pipe;

const load = () => (pipe ||= (async () => {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(here, '..', '.model-cache');
  return pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8' });
})().catch((e) => { pipe = null; throw e; }));

process.on('message', async ({ id, jpeg }) => {
  try {
    const estimate = await load();
    const input = await sharp(Buffer.from(jpeg, 'base64')).jpeg().toBuffer();
    const { depth } = await estimate(new Blob([input], { type: 'image/jpeg' }));
    const webp = await sharp(Buffer.from(depth.data), { raw: { width: depth.width, height: depth.height, channels: depth.channels } })
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 90 })
      .toBuffer();
    process.send({ id, webp: webp.toString('base64') });
  } catch (e) {
    process.send({ id, error: String(e?.message || e) });
  }
});
