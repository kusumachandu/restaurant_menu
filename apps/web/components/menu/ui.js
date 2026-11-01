// Look of the guest menu: a dark, fine-dining palette that stays the same in light and dark system mode.
export const C = {
  bg: '#0c0806',
  panel: '#15100c',
  panelHi: '#1d1611',
  line: 'rgba(233,213,176,.13)',
  lineHi: 'rgba(212,168,75,.45)',
  gold: '#d4a84b',
  goldSoft: '#ecd08f',
  ivory: '#f4ead8',
  mute: '#a59680',
  ember: '#e08a46',
  veg: '#3fb676',
  nonveg: '#e2594e',
};

export const FONT = {
  display: "var(--font-display), 'Cormorant Garamond', Georgia, serif",
  sans: "var(--font-sans), system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const EASE = [0.2, 0.8, 0.2, 1];

export const slugId = (c) => `cat-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// Fine grain over dark surfaces, so large flat areas do not look like plastic.
export const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .7  0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.5'/></svg>\")";
