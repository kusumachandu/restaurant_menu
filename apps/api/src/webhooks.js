import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Restaurant, WebhookEvent } from './models.js';

// Events go to the restaurant's own webhook URL as JSON:
//   { id, event, createdAt, restaurant: { slug, name }, data }
// Every request is signed: X-Webhook-Signature = "sha256=" + HMAC-SHA256(secret, `${timestamp}.${body}`), with the
// timestamp in X-Webhook-Timestamp. A receiver should reject a bad signature and ignore an id it has already seen.
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600]; // waits between tries
const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1;
const production = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// Only web addresses the restaurant could reasonably own: https in production, and nothing that points inside our network.
export function checkWebhookUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'That is not a valid web address.'; }
  if (!['https:', 'http:'].includes(u.protocol)) return 'The address must start with https://';
  if (production()) {
    if (u.protocol !== 'https:') return 'The address must start with https://';
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]' || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)) {
      return 'That address is not reachable from the internet.';
    }
  }
  return null;
}

export const newSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

function build(restaurant, type, data, id = new mongoose.Types.ObjectId()) {
  return { _id: id, payload: { id: String(id), event: type, createdAt: new Date().toISOString(), restaurant: { slug: restaurant.slug, name: restaurant.name }, data } };
}

async function post(hook, payload) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', hook.secret || '').update(`${ts}.${body}`).digest('hex');
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'User-Agent': 'menu3d-webhook/1',
        'X-Webhook-Id': payload.id, 'X-Webhook-Event': payload.event, 'X-Webhook-Timestamp': ts, 'X-Webhook-Signature': `sha256=${sig}`,
      },
      body, redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, error: res.ok ? '' : `The receiver answered ${res.status}` };
  } catch (e) {
    const why = e?.name === 'TimeoutError' ? 'Timed out' : e?.cause?.code || e?.message || String(e);
    return { ok: false, status: null, error: `Could not reach the address: ${why}`.slice(0, 200) };
  }
}

/** Queues an event for the restaurant's webhook, if it has one switched on. Never throws: a webhook problem must not break an order. */
export async function emit(restaurantId, type, data) {
  try {
    const r = await Restaurant.findById(restaurantId).select('slug name webhook').lean();
    if (!r?.webhook?.enabled || !r.webhook.url) return;
    const { _id, payload } = build(r, type, data);
    await WebhookEvent.create({ _id, restaurantId: r._id, type, payload });
  } catch (e) { console.error('webhook emit failed', e.message); }
}

/** Sends one test event right away so the owner can see whether their endpoint answers. */
export async function sendTest(restaurant) {
  const { payload } = build(restaurant, 'webhook.test', { message: 'This is a test event from your menu.' });
  return post(restaurant.webhook, payload);
}

async function attempt(ev) {
  const r = await Restaurant.findById(ev.restaurantId).select('webhook').lean();
  if (!r?.webhook?.enabled || !r.webhook.url) {
    await WebhookEvent.updateOne({ _id: ev._id }, { status: 'failed', lastError: 'The webhook is switched off or has no address.' });
    return;
  }
  const out = await post(r.webhook, ev.payload);
  const attempts = ev.attempts + 1;
  if (out.ok) { await WebhookEvent.updateOne({ _id: ev._id }, { status: 'sent', attempts, sentAt: new Date(), lastStatus: out.status, lastError: '' }); return; }
  const done = attempts >= MAX_ATTEMPTS;
  await WebhookEvent.updateOne({ _id: ev._id }, {
    attempts, lastStatus: out.status, lastError: out.error,
    status: done ? 'failed' : 'pending', nextAttemptAt: new Date(Date.now() + (BACKOFF_SECONDS[attempts - 1] || 21600) * 1000),
  });
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (let i = 0; i < 10; i++) {
      const now = new Date();
      // Claiming pushes the next try a minute out, so a crash mid-send is retried and two loops never send the same event.
      const ev = await WebhookEvent.findOneAndUpdate(
        { status: 'pending', nextAttemptAt: { $lte: now } }, { nextAttemptAt: new Date(now.getTime() + 60000) }, { sort: { nextAttemptAt: 1 }, new: true });
      if (!ev) break;
      await attempt(ev);
    }
  } catch (e) { console.error('webhook loop failed', e.message); } finally { busy = false; }
}

export function startWebhookWorker() {
  setInterval(tick, 5000).unref();
}

/** Puts a failed event back in the queue (the "Retry" button). */
export const retryEvent = (restaurantId, id) =>
  WebhookEvent.findOneAndUpdate({ _id: id, restaurantId, status: 'failed' }, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: '' }, { new: true });
