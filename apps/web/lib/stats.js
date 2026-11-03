'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

/* ---------- formatting ---------- */
const nf = new Intl.NumberFormat('en-IN');
const cf = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const count = (n) => nf.format(Math.round(n || 0));
// ₹6,86,849 in full, or ₹6.9L-style when it must be short (chart axes, tight cards).
export const money = (n, cur = '₹', short = false) => `${cur}${short && Math.abs(n) >= 100000 ? cf.format(n) : nf.format(Math.round(n || 0))}`;
export const percent = (n, digits = 0) => `${(n || 0).toFixed(digits)}%`;
export const ratio = (a, b) => (b ? (a / b) * 100 : 0);

/** Change against the period before, as a percentage; null when it is new, undefined when both are zero (nothing to say). */
export function change(now, before) {
  if (!before) return now ? null : undefined;
  return ((now - before) / before) * 100;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (d) => WEEKDAYS[d - 1]; // MongoDB's $dayOfWeek: 1 = Sunday
export const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export function slotLabel(ms, bucket, tz) {
  const o = bucket === 'hour' ? { hour: 'numeric', hour12: true, timeZone: tz } : { day: 'numeric', month: 'short', timeZone: tz };
  return new Date(ms).toLocaleString('en-IN', o).toUpperCase();
}
export function slotTitle(ms, bucket, tz) {
  const o = bucket === 'hour' ? { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hour12: true, timeZone: tz } : { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz };
  return new Date(ms).toLocaleString('en-IN', o);
}

/* ---------- loading ---------- */
const RANGE_KEY = 'menu3d_dash_range';
export function loadRange() {
  try { return JSON.parse(localStorage.getItem(RANGE_KEY)) || { range: '7d' }; } catch { return { range: '7d' }; }
}
export function saveRange(r) { try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch { /* private window: fine */ } }

/**
 * Loads a dashboard's numbers and keeps them fresh: every minute while the tab is showing, and again when the person
 * comes back to it. The last numbers stay on screen while a new range loads, so the page never flashes empty.
 */
export function useStats(path, params, every = 60000) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const latest = useRef(0);
  const query = new URLSearchParams(params).toString();

  const load = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api(`${path}?${query}`);
      if (id === latest.current) setState({ data, error: '', loading: false });
    } catch (e) {
      if (id === latest.current) setState((s) => ({ ...s, error: e.message, loading: false }));
    }
  }, [path, query]);

  useEffect(() => {
    load();
    const tick = () => { if (!document.hidden) load(); };
    const timer = setInterval(tick, every);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); latest.current++; };
  }, [load, every]);

  return { ...state, reload: load };
}
