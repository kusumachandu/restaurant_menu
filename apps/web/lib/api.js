// Server-side helper used by the public menu page.
export const API_URL = process.env.API_URL || 'http://localhost:4000';

const EMPTY = { settings: { name: 'Menu', tagline: '', currency: '₹' }, categories: [], dishes: [] };

export async function getMenu() {
  try {
    const res = await fetch(`${API_URL}/api/menu`, { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    return await res.json();
  } catch {
    return EMPTY;
  }
}
