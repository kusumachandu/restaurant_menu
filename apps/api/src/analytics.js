import { Customer, Order, Restaurant, TableSession, WebhookEvent } from './models.js';
import { PLANS } from './plans.js';

// All the numbers on the two dashboards. MongoDB does the grouping (each query reads one indexed date range), so the
// browser only draws. Results are cached for a few seconds and shared by everyone asking for the same thing.
//
// Definitions, shown to the owner on the dashboard:
//   Revenue  = value of orders that were not cancelled.  Settled = the part whose table's bill is paid.
//   Orders   = orders that were not cancelled.  Cancelled orders are counted on their own.
//   Visits   = tables that checked in (a party that verified its number), People = the seats they said were taken.
const TZ = process.env.ANALYTICS_TZ || 'Asia/Kolkata';
const DAY = 86400000;
const HOUR = 3600000;
const MAX_DAYS = 366;
const CACHE_MS = 30000;

/* ---------- dates in the restaurant's time zone ---------- */
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const localParts = (ms) => Object.fromEntries(parts.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]));
const offsetAt = (ms) => { const p = localParts(ms); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
const dayStart = (ms) => { const p = localParts(ms); const guess = Date.UTC(p.year, p.month - 1, p.day); return guess - offsetAt(guess); };
// "2026-11-03" or "2026-11-03T09", the same text MongoDB's $dateToString produces for that time zone.
const keyOf = (ms, bucket) => { const p = localParts(ms); const pad = (n) => String(n).padStart(2, '0'); const d = `${p.year}-${pad(p.month)}-${pad(p.day)}`; return bucket === 'hour' ? `${d}T${pad(p.hour)}` : d; };
const dateText = /^\d{4}-\d{2}-\d{2}$/;
const startOfText = (t) => { const [y, m, d] = t.split('-').map(Number); const guess = Date.UTC(y, m - 1, d); return guess - offsetAt(guess); };

/**
 * Turns ?range=today|yesterday|7d|30d|90d|custom (&from=YYYY-MM-DD&to=YYYY-MM-DD) into a window plus the window just
 * before it, shifted by whole days so a half-finished day is compared with the same hours of the earlier day.
 */
export function parseRange(q = {}, nowMs = Date.now()) {
  const today = dayStart(nowMs);
  let key = ['today', 'yesterday', '7d', '30d', '90d', 'custom'].includes(q.range) ? q.range : '7d';
  if (key === 'custom' && !(dateText.test(q.from || '') && dateText.test(q.to || ''))) key = '7d';
  let from; let to;
  if (key === 'today') { from = today; to = nowMs; }
  else if (key === 'yesterday') { from = today - DAY; to = today; }
  else if (key === 'custom') {
    from = startOfText(q.from);
    to = Math.min(startOfText(q.to) + DAY, nowMs);
    if (!(to > from)) { key = '7d'; from = today - 6 * DAY; to = nowMs; }
    if (to - from > MAX_DAYS * DAY) from = to - MAX_DAYS * DAY;
  } else { from = today - ({ '30d': 29, '90d': 89 }[key] ?? 6) * DAY; to = nowMs; }
  const days = Math.max(1, Math.ceil((to - from) / DAY));
  const bucket = days <= 2 ? 'hour' : 'day';
  const step = bucket === 'hour' ? HOUR : DAY;
  const count = Math.ceil((to - from) / step);
  const shift = days * DAY;
  return {
    key, from: new Date(from), to: new Date(to),
    prevFrom: new Date(from - shift), prevTo: new Date(to - shift), days, bucket, step, count,
  };
}

const format = (bucket) => (bucket === 'hour' ? '%Y-%m-%dT%H' : '%Y-%m-%d');
const cond = (test, yes, no = 0) => ({ $cond: [test, yes, no] });
const live = { $ne: ['$status', 'cancelled'] };
const paid = { $gt: ['$paidAt', null] };
const periodOf = (r) => cond({ $gte: ['$createdAt', r.from] }, 'cur', cond({ $lt: ['$createdAt', r.prevTo] }, 'prev', 'gap'));

const emptyTotals = () => ({ orders: 0, cancelled: 0, cancelledByCustomer: 0, cancelledByKitchen: 0, revenue: 0, settled: 0, items: 0, linked: 0 });
function totalsOf(rows) {
  const out = { cur: emptyTotals(), prev: emptyTotals() };
  for (const row of rows) if (out[row._id]) { const { _id, ...rest } = row; Object.assign(out[row._id], rest); }
  for (const t of Object.values(out)) t.avgOrder = t.orders ? Math.round((t.revenue / t.orders) * 100) / 100 : 0;
  return out;
}

// The two windows side by side, one slot per hour or day, with empty slots as zeros so the chart has no gaps.
function seriesOf(rows, r) {
  const byKey = new Map(rows.map((x) => [x._id, x]));
  const at = (start, i) => byKey.get(keyOf(start + i * r.step, r.bucket));
  return Array.from({ length: r.count }, (_, i) => {
    const c = at(r.from.getTime(), i); const p = at(r.prevFrom.getTime(), i);
    return { t: r.from.getTime() + i * r.step, orders: c?.orders || 0, revenue: c?.revenue || 0, prevOrders: p?.orders || 0, prevRevenue: p?.revenue || 0 };
  });
}

const rangeInfo = (r) => ({ key: r.key, from: r.from, to: r.to, prevFrom: r.prevFrom, prevTo: r.prevTo, days: r.days, bucket: r.bucket, tz: TZ });

/* ---------- a few seconds of cache, shared by identical requests ---------- */
const cache = new Map();
function cached(key, work) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = work().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  if (cache.size > 300) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
  return promise;
}

const sums = {
  orders: { $sum: cond(live, 1) },
  cancelled: { $sum: cond({ $eq: ['$status', 'cancelled'] }, 1) },
  cancelledByCustomer: { $sum: cond({ $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'customer'] }] }, 1) },
  cancelledByKitchen: { $sum: cond({ $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'kitchen'] }] }, 1) },
  revenue: { $sum: cond(live, '$total') },
  settled: { $sum: cond({ $and: [live, paid] }, '$total') },
  items: { $sum: cond(live, { $sum: '$items.qty' }) },
  linked: { $sum: cond({ $and: [live, { $gt: ['$customerPhone', null] }] }, 1) },
};

/* ---------- one restaurant ---------- */
export function restaurantStats(restaurantId, query) {
  const r = parseRange(query);
  return cached(`r|${restaurantId}|${r.key}|${r.from.getTime()}|${r.days}`, async () => {
    const own = { restaurantId };
    const cur = { ...own, createdAt: { $gte: r.from, $lt: r.to } };
    const both = { ...own, createdAt: { $gte: r.prevFrom, $lt: r.to } };
    const tz = { timezone: TZ };

    const [totals, series, heat, dishes, tables, spenders, sessions, newNow, newBefore, returning, everyone, verified, regular] = await Promise.all([
      Order.aggregate([{ $match: both }, { $group: { _id: periodOf(r), ...sums } }]),
      Order.aggregate([
        { $match: { ...both, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: format(r.bucket), date: '$createdAt', ...tz } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { ...cur, status: { $ne: 'cancelled' } } },
        { $group: { _id: { d: { $dayOfWeek: { date: '$createdAt', ...tz } }, h: { $hour: { date: '$createdAt', ...tz } } }, n: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { ...cur, status: { $ne: 'cancelled' } } }, { $unwind: '$items' },
        { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
        { $facet: { byQty: [{ $sort: { qty: -1, _id: 1 } }, { $limit: 8 }], byRevenue: [{ $sort: { revenue: -1, _id: 1 } }, { $limit: 8 }] } },
      ]),
      Order.aggregate([
        { $match: { ...cur, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$tableLabel', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1, _id: 1 } }, { $limit: 8 },
      ]),
      Order.aggregate([
        { $match: { ...cur, status: { $ne: 'cancelled' }, customerPhone: { $ne: null } } },
        { $group: { _id: '$customerPhone', orders: { $sum: 1 }, spend: { $sum: '$total' } } },
        { $sort: { spend: -1, _id: 1 } }, { $limit: 5 },
      ]),
      TableSession.aggregate([
        { $match: both }, { $group: { _id: periodOf(r), visits: { $sum: 1 }, people: { $sum: '$guests' } } },
      ]),
      Customer.countDocuments({ ...own, firstVisitAt: { $gte: r.from, $lt: r.to } }),
      Customer.countDocuments({ ...own, firstVisitAt: { $gte: r.prevFrom, $lt: r.prevTo } }),
      Customer.countDocuments({ ...own, lastVisitAt: { $gte: r.from, $lt: r.to }, firstVisitAt: { $lt: r.from } }),
      Customer.countDocuments(own),
      Customer.countDocuments({ ...own, verified: true }),
      Customer.find({ ...own, lastVisitAt: { $gte: r.from, $lt: r.to } }).sort({ visits: -1, lastVisitAt: -1 }).limit(5).select('phone visits').lean(),
    ]);

    const visit = Object.fromEntries(sessions.map((s) => [s._id, s]));
    const t = totalsOf(totals);
    return {
      range: rangeInfo(r),
      totals: t,
      series: seriesOf(series, r),
      heatmap: heat.map((x) => ({ d: x._id.d, h: x._id.h, n: x.n })), // d: 1 = Sunday ... 7 = Saturday
      dishes: dishes[0] || { byQty: [], byRevenue: [] },
      tables: tables.map((x) => ({ name: x._id, orders: x.orders, revenue: x.revenue })),
      guests: {
        visits: visit.cur?.visits || 0, prevVisits: visit.prev?.visits || 0, people: visit.cur?.people || 0, prevPeople: visit.prev?.people || 0,
        newGuests: newNow, prevNewGuests: newBefore, returning, total: everyone, verified,
        spenders: spenders.map((x) => ({ phone: x._id, orders: x.orders, spend: x.spend })),
        regulars: regular.map((x) => ({ phone: x.phone, visits: x.visits })),
      },
      generatedAt: new Date(),
    };
  });
}

/* ---------- the whole platform (platform owner) ---------- */
const orderingPlans = Object.keys(PLANS).filter((p) => PLANS[p].ordering);

export function platformStats(query) {
  const r = parseRange(query);
  return cached(`p|${r.key}|${r.from.getTime()}|${r.days}`, async () => {
    const cur = { createdAt: { $gte: r.from, $lt: r.to } };
    const both = { createdAt: { $gte: r.prevFrom, $lt: r.to } };
    const day = new Date(Date.now() - DAY);

    const [totals, series, perRestaurant, restaurants, sessions, newNow, newBefore, everyone, hooks, hooked, checkIns] = await Promise.all([
      Order.aggregate([{ $match: both }, { $group: { _id: periodOf(r), ...sums } }]),
      Order.aggregate([
        { $match: { ...both, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: format(r.bucket), date: '$createdAt', timezone: TZ } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { ...cur, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$restaurantId', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      Restaurant.find().select('name slug plan active createdAt').lean(),
      TableSession.aggregate([{ $match: both }, { $group: { _id: periodOf(r), visits: { $sum: 1 }, people: { $sum: '$guests' } } }]),
      Customer.countDocuments({ firstVisitAt: { $gte: r.from, $lt: r.to } }),
      Customer.countDocuments({ firstVisitAt: { $gte: r.prevFrom, $lt: r.prevTo } }),
      Customer.estimatedDocumentCount(),
      WebhookEvent.aggregate([{ $match: { createdAt: { $gte: day } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Restaurant.countDocuments({ active: true, 'webhook.enabled': true }),
      Restaurant.countDocuments({ active: true, customerCheckIn: true }),
    ]);

    const byId = new Map(restaurants.map((x) => [String(x._id), x]));
    const sold = new Map(perRestaurant.map((x) => [String(x._id), x]));
    const visit = Object.fromEntries(sessions.map((s) => [s._id, s]));
    const hook = Object.fromEntries(hooks.map((h) => [h._id, h.n]));
    const running = restaurants.filter((x) => x.active);
    const plans = Object.keys(PLANS).map((p) => ({ plan: p, label: PLANS[p].label, active: running.filter((x) => x.plan === p).length, suspended: restaurants.filter((x) => x.plan === p && !x.active).length }));

    return {
      range: rangeInfo(r),
      totals: totalsOf(totals),
      series: seriesOf(series, r),
      restaurants: {
        total: restaurants.length, active: running.length, suspended: restaurants.length - running.length, plans,
        added: restaurants.filter((x) => x.createdAt >= r.from).length, addedBefore: restaurants.filter((x) => x.createdAt >= r.prevFrom && x.createdAt < r.prevTo).length,
        selling: sold.size, withCheckIn: checkIns, withWebhook: hooked,
      },
      top: [...sold.entries()]
        .map(([id, v]) => ({ id, name: byId.get(id)?.name || 'Deleted restaurant', slug: byId.get(id)?.slug || '', plan: byId.get(id)?.plan || '', orders: v.orders, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders).slice(0, 8),
      // Paying for ordering but nobody ordered in this period: worth a call.
      quiet: running.filter((x) => orderingPlans.includes(x.plan) && !sold.has(String(x._id))).map((x) => ({ id: String(x._id), name: x.name, slug: x.slug, plan: x.plan, since: x.createdAt })).slice(0, 10),
      guests: { visits: visit.cur?.visits || 0, prevVisits: visit.prev?.visits || 0, people: visit.cur?.people || 0, newGuests: newNow, prevNewGuests: newBefore, total: everyone },
      webhooks: { sent: hook.sent || 0, pending: hook.pending || 0, failed: hook.failed || 0 },
      generatedAt: new Date(),
    };
  });
}

/** Last 30 days per restaurant, for the restaurant list. One query for all of them. */
export async function recentSales(days = 30) {
  const since = new Date(dayStart(Date.now()) - (days - 1) * DAY);
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$restaurantId', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
  ]);
  return new Map(rows.map((x) => [String(x._id), x]));
}
