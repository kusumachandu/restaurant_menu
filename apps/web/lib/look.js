// Per-dish lighting/appearance settings. Admins tune these; the menu applies them.
// Keep the keys and ranges in sync with `lookSchema` in apps/api/src/routes.js.
export const DEFAULT_LOOK = {
  brightness: 1,   // overall multiplier for every light and the glow
  key: 1.6,        // main light strength
  ambient: 1.1,    // soft fill light
  azimuth: -27,    // main light direction, degrees left/right
  elevation: 31,   // main light height, degrees
  warmth: 0.6,     // 0 = cool light, 1 = warm light
  glow: 0.6,       // how much the photo lights itself
  depth: 0.16,     // how raised the food looks
  shine: 0.65,     // surface roughness: low = glossy
  spin: 0.6,       // idle spin speed on the menu
};

export const LOOK_FIELDS = [
  ['brightness', 'Brightness', 0.2, 2.5, 0.05],
  ['key', 'Main light', 0, 4, 0.05],
  ['ambient', 'Soft fill light', 0, 3, 0.05],
  ['azimuth', 'Light direction', -180, 180, 1],
  ['elevation', 'Light height', -10, 90, 1],
  ['warmth', 'Light warmth', 0, 1, 0.01],
  ['glow', 'Photo glow', 0, 1.5, 0.05],
  ['depth', 'Relief depth', 0, 0.4, 0.01],
  ['shine', 'Roughness (low = glossy)', 0.2, 1, 0.01],
  ['spin', 'Idle spin speed', 0, 2, 0.05],
];

export const resolveLook = (look) => ({ ...DEFAULT_LOOK, ...(look || {}) });
