// Turns a food photo into a height map and a normal map, so a flat photo
// can be lit and displaced like a shallow relief in three.js.
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const canvas = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export function cropSquare(img, size = 512) {
  const c = canvas(size);
  const m = Math.min(img.naturalWidth, img.naturalHeight);
  c.getContext('2d').drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, size, size);
  return c;
}

function blur(data, S, k) {
  const a = canvas(S);
  a.getContext('2d').putImageData(new ImageData(data, S, S), 0, 0);
  const s = canvas(Math.ceil(S / k));
  const sx = s.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(a, 0, 0, s.width, s.height);
  const o = canvas(S);
  const ox = o.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(s, 0, 0, S, S);
  return ox.getImageData(0, 0, S, S).data;
}

export function buildMaps(square, S = 256) {
  const c = canvas(S);
  const x = c.getContext('2d');
  x.drawImage(square, 0, 0, S, S);
  const p = x.getImageData(0, 0, S, S).data;
  const n = S * S;
  const lum = new Float32Array(n);
  const ins = new Float32Array(n);
  const meat = new Uint8ClampedArray(n * 4);
  const lumRgba = new Uint8ClampedArray(n * 4);
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    const r = p[q], g = p[q + 1], b = p[q + 2];
    const X = i % S, Y = (i / S) | 0;
    ins[i] = 1 - ss(S * 0.43, S * 0.49, Math.hypot(X - S / 2, Y - S / 2));
    lum[i] = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    // reddish, mid-bright pixels are usually meat or fried pieces: raise them most
    const m = ss(55, 100, r - g) * (1 - ss(185, 225, r)) * 255;
    meat[q] = meat[q + 1] = meat[q + 2] = m;
    meat[q + 3] = 255;
    const l = lum[i] * 255;
    lumRgba[q] = lumRgba[q + 1] = lumRgba[q + 2] = l;
    lumRgba[q + 3] = 255;
  }
  const mB = blur(meat, S, 7);
  const lB = blur(lumRgba, S, 7);
  const h = new Float32Array(n);
  for (let i = 0, q = 0; i < n; i++, q += 4) h[i] = ins[i] * (0.2 + 0.3 * (lB[q] / 255) + 0.6 * Math.min(1, mB[q] / 200));

  const height = canvas(S), normal = canvas(S);
  const hd = height.getContext('2d').createImageData(S, S);
  const nd = normal.getContext('2d').createImageData(S, S);
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    const v = Math.round(Math.min(1, h[i]) * 255);
    hd.data[q] = hd.data[q + 1] = hd.data[q + 2] = v;
    hd.data[q + 3] = 255;
    const X = i % S, Y = (i / S) | 0;
    const xl = i - (X > 0 ? 1 : 0), xr = i + (X < S - 1 ? 1 : 0);
    const yu = i - (Y > 0 ? S : 0), yd = i + (Y < S - 1 ? S : 0);
    const dx = (h[xl] - h[xr]) * 9 + (lum[xl] - lum[xr]) * 2;
    const dy = (h[yd] - h[yu]) * 9 + (lum[yd] - lum[yu]) * 2;
    const ln = Math.sqrt(dx * dx + dy * dy + 1);
    nd.data[q] = (dx / ln * 0.5 + 0.5) * 255;
    nd.data[q + 1] = (dy / ln * 0.5 + 0.5) * 255;
    nd.data[q + 2] = (1 / ln * 0.5 + 0.5) * 255;
    nd.data[q + 3] = 255;
  }
  height.getContext('2d').putImageData(hd, 0, 0);
  normal.getContext('2d').putImageData(nd, 0, 0);
  return { height, normal };
}
