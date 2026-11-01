// Server-side helper used by the public menu page.
export const API_URL = process.env.API_URL || 'http://localhost:4000';

// Returns null when the restaurant does not exist (or is suspended).
// `table` is the token from a table's QR code; it switches ordering on.
export async function getMenu(slug, table) {
  try {
    const q = table ? `?t=${encodeURIComponent(table)}` : '';
    // Anonymous menus are cached briefly; table (ordering) views stay fresh.
    const opts = table ? { cache: 'no-store' } : { next: { revalidate: 20 } };
    const res = await fetch(`${API_URL}/api/r/${encodeURIComponent(slug)}/menu${q}`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
