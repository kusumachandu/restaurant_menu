// Turns a dish photo into a solid, softly domed shape, so it keeps its volume when tilted.
//  - With a cutout (background removed): the dish's own outline, with the food heaped on top and a tapered bowl
//    body underneath, so it also looks right from the side (a flat top-down photo alone looks like a thin disc).
//  - Without one: the photo cropped to a soft circle.
// Used by the 3D viewer (Dish3D) and by the AR model (ArButton).
export const DOME = 0.16; // full height of the food dome at the default lighting depth
export const BOWL = 0.34; // how deep the body under it goes
const G = 136;            // grid cells per side

const canvas = (w) => {
  const c = document.createElement('canvas');
  c.width = c.height = w;
  return c;
};

function boxBlur(src, n, r) {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  const pass = (from, to, horizontal) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        let sum = 0, cnt = 0;
        for (let k = -r; k <= r; k++) {
          const t = b + k;
          if (t < 0 || t >= n) continue;
          sum += from[horizontal ? a * n + t : t * n + a];
          cnt++;
        }
        to[horizontal ? a * n + b : b * n + a] = sum / cnt;
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

/**
 * @param THREE   the three module
 * @param img     a decoded <img> (the cutout, or the plain photo)
 * @param cutout  true when `img` has a transparent background
 * @param size    texture size in px
 * @returns {{ texture: HTMLCanvasElement, mask: HTMLCanvasElement, geometry: THREE.BufferGeometry, underside: THREE.BufferGeometry, size: number }}
 *   geometry (the food) is flat in x/y (a `size` square, centred) with z = 0..DOME; underside is the bowl body, z = 0..-BOWL,
 *   narrowing towards the bottom. Both share the texture, which carries colour and alpha.
 */
export function prepareDish(THREE, img, cutout, size = 512, extent = 1.9) {
  const iw = img.naturalWidth, ih = img.naturalHeight;

  // Square crop: tight around the dish for a cutout, the centre of the photo otherwise.
  let sx = (iw - Math.min(iw, ih)) / 2, sy = (ih - Math.min(iw, ih)) / 2, ss = Math.min(iw, ih);
  if (cutout) {
    const p = canvas(96);
    const px = p.getContext('2d', { willReadFrequently: true });
    px.drawImage(img, 0, 0, 96, 96);
    const d = px.getImageData(0, 0, 96, 96).data;
    let x0 = 96, y0 = 96, x1 = -1, y1 = -1;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      if (d[(y * 96 + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 >= 0) {
      const side = Math.min(1, Math.max(x1 - x0 + 1, y1 - y0 + 1) / 96 * 1.06);
      const cx = Math.min(1 - side / 2, Math.max(side / 2, (x0 + x1 + 1) / 2 / 96));
      const cy = Math.min(1 - side / 2, Math.max(side / 2, (y0 + y1 + 1) / 2 / 96));
      ss = side * Math.min(iw, ih);
      sx = (cx - side / 2) * iw;
      sy = (cy - side / 2) * ih;
    }
  }

  const texture = canvas(size);
  const tx = texture.getContext('2d', { willReadFrequently: true });
  if (!cutout) {
    tx.beginPath();
    tx.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2);
    tx.clip();
  }
  tx.drawImage(img, sx, sy, ss, ss, 0, 0, size, size);

  // Height field from the outline: highest in the middle, falling to zero at the edge.
  const n = G + 1;
  const small = canvas(n);
  const sc = small.getContext('2d', { willReadFrequently: true });
  sc.drawImage(texture, 0, 0, n, n);
  const px = sc.getImageData(0, 0, n, n).data;
  const alpha = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) alpha[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  const soft = boxBlur(boxBlur(boxBlur(alpha, n, 4), n, 4), n, 3);
  const wide = boxBlur(boxBlur(boxBlur(alpha, n, 11), n, 11), n, 9); // gentle field for the tapering bowl wall

  let rr = 0, rg = 0, rb = 0, rc = 0;
  for (let k = 0; k < n * n; k++) {
    if (alpha[k] && soft[k] < 0.8 && px[k * 4 + 3] > 250) { rr += px[k * 4]; rg += px[k * 4 + 1]; rb += px[k * 4 + 2]; rc++; }
  }
  const rim = rc ? [rr / rc / 255, rg / rc / 255, rb / rc / 255] : [0.55, 0.4, 0.28];

  const pos = new Float32Array(n * n * 3);
  const low = new Float32Array(n * n * 3);
  const tint = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const inside = Math.min(1, Math.max(0, (soft[k] - 0.5) * 2));
      pos[k * 3] = (i / G - 0.5) * extent;
      pos[k * 3 + 1] = (0.5 - j / G) * extent;
      pos[k * 3 + 2] = Math.pow(inside, 0.7) * DOME; // continuous, so the rim stays smooth when the dish is tilted
      // Bowl body: from the rim the wall drops and narrows towards a flat base, like a real bowl.
      // `t` is a gentle, wide field; the taper is linear in it so the wall cannot fold over itself.
      const t = Math.min(1, Math.max(0, (wide[k] - 0.5) * 2));
      const deep = Math.pow(t, 0.7);
      const taper = 1 - 0.22 * t;
      low[k * 3] = pos[k * 3] * taper;
      low[k * 3 + 1] = pos[k * 3 + 1] * taper;
      low[k * 3 + 2] = -deep * BOWL;
      const shade = 0.95 - 0.5 * deep; // darker towards the base
      tint[k * 3] = rim[0] * shade; tint[k * 3 + 1] = rim[1] * shade; tint[k * 3 + 2] = rim[2] * shade;
      uv[k * 2] = i / G;
      uv[k * 2 + 1] = 1 - j / G;
    }
  }
  const idx = [];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (!(alpha[a] || alpha[b] || alpha[c] || alpha[d])) continue; // nothing of the dish here
      idx.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  const underside = new THREE.BufferGeometry();
  underside.setAttribute('position', new THREE.BufferAttribute(low, 3));
  underside.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  underside.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  underside.setIndex(idx); // drawn double-sided by the caller: the inside of the wall behind the food, and the outside from below
  underside.computeVertexNormals();

  // Smooth outline for the bowl body: the blurred outline scaled up, so alpha-testing at 0.5 gives a clean contour
  // (the cutout's own edge is ragged, which suits food but not a bowl wall).
  const grey = canvas(n);
  const gx = grey.getContext('2d');
  const gd = gx.createImageData(n, n);
  for (let k = 0; k < n * n; k++) { const v = Math.round(soft[k] * 255); gd.data[k * 4] = gd.data[k * 4 + 1] = gd.data[k * 4 + 2] = v; gd.data[k * 4 + 3] = 255; }
  gx.putImageData(gd, 0, 0);
  const mask = canvas(size);
  const mx = mask.getContext('2d');
  mx.imageSmoothingQuality = 'high';
  mx.drawImage(grey, 0, 0, size, size);
  return { texture, mask, geometry, underside, size: extent };
}
