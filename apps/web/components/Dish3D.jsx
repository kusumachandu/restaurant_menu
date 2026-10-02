'use client';
import { useEffect, useRef, useState } from 'react';
import { buildMaps, cropSquare } from '@/lib/relief';
import { resolveLook } from '@/lib/look';

const TAU = Math.PI * 2;

function backCanvas(name, price) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#1a130e';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#d9a441';
  x.lineWidth = 6;
  x.beginPath(); x.arc(256, 256, 236, 0, TAU); x.stroke();
  x.lineWidth = 2;
  x.beginPath(); x.arc(256, 256, 222, 0, TAU); x.stroke();
  x.textAlign = 'center';
  x.fillStyle = '#f6e8d6';
  x.font = '700 38px Georgia, serif';
  const lines = [''];
  name.split(' ').forEach((w) => {
    const last = lines.length - 1;
    if ((lines[last] + ' ' + w).length > 15 && lines[last]) lines.push(w);
    else lines[last] = lines[last] ? `${lines[last]} ${w}` : w;
  });
  const y0 = 250 - (lines.length - 1) * 24;
  lines.forEach((t, j) => x.fillText(t, 256, y0 + j * 48));
  x.fillStyle = '#d9a441';
  x.font = '700 44px Georgia, serif';
  x.fillText(price, 256, y0 + lines.length * 48 + 30);
  return c;
}

const RAD = Math.PI / 180;
const COOL = [0.87, 0.92, 1];
const WARM = [1, 0.85, 0.66];

/**
 * A dish plate in 3D. Two modes:
 *  - "card":   small, gently spinning, tilts toward the pointer; click opens the viewer.
 *  - "viewer": drag to turn it to any angle, pinch/scroll to zoom. Used in the menu's
 *              full-screen viewer and in the admin preview.
 * `look` (lighting settings) is read every frame, so sliders update live without
 * rebuilding the scene. The WebGL scene exists only while the element is on screen.
 */
export default function Dish3D({ dish, currency, look, mode = 'card', onOpen, apiRef }) {
  const box = useRef(null);
  const lookRef = useRef(resolveLook(look));
  const labelRef = useRef({ name: dish.name, price: `${currency}${dish.price}` });
  const liveApi = useRef(null);
  const [failed, setFailed] = useState(!dish.imageId);
  const viewer = mode === 'viewer';

  lookRef.current = resolveLook(look);
  labelRef.current = { name: dish.name, price: `${currency}${dish.price}` };
  useEffect(() => { liveApi.current?.setBack(); }, [dish.name, dish.price, currency]);

  useEffect(() => {
    if (failed || !box.current) return undefined;
    const el = box.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let live = null;
    let gen = 0;

    async function start() {
      const my = ++gen;
      const THREE = await import('three');
      const img = new Image();
      img.src = `/api/images/${dish.imageId}`;
      try { await img.decode(); } catch { setFailed(true); return; }
      if (my !== gen) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch { setFailed(true); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.insertBefore(renderer.domElement, el.firstChild);

      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.z = 5.6;
      const hemi = new THREE.HemisphereLight(0xffffff, 0x998877, 1.1);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
      scene.add(sun);
      const group = new THREE.Group();
      scene.add(group);

      const plateGeo = new THREE.CylinderGeometry(1, 1, 0.16, 96);
      plateGeo.rotateX(Math.PI / 2);
      group.add(new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.25 })));

      const square = cropSquare(img, 512);
      const maps = buildMaps(square);
      const mask = document.createElement('canvas');
      mask.width = mask.height = 128;
      const mx = mask.getContext('2d');
      mx.fillStyle = '#000'; mx.fillRect(0, 0, 128, 128);
      mx.fillStyle = '#fff'; mx.beginPath(); mx.arc(64, 64, 62, 0, TAU); mx.fill();

      const photo = new THREE.CanvasTexture(square);
      photo.colorSpace = THREE.SRGBColorSpace;
      photo.anisotropy = 4;
      const frontMat = new THREE.MeshStandardMaterial({
        map: photo,
        emissive: 0xffffff,
        emissiveMap: photo,
        emissiveIntensity: 0.6,
        displacementMap: new THREE.CanvasTexture(maps.height),
        displacementScale: 0.16,
        normalMap: new THREE.CanvasTexture(maps.normal),
        alphaMap: new THREE.CanvasTexture(mask),
        alphaTest: 0.5,
        roughness: 0.65,
      });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.84, 110, 110), frontMat);
      front.position.z = 0.081;
      group.add(front);

      const backMat = new THREE.MeshBasicMaterial();
      const back = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), backMat);
      back.rotation.y = Math.PI;
      back.position.z = -0.082;
      group.add(back);
      const setBack = () => {
        backMat.map?.dispose();
        const { name, price } = labelRef.current;
        backMat.map = new THREE.CanvasTexture(backCanvas(name, price));
        backMat.map.colorSpace = THREE.SRGBColorSpace;
        backMat.needsUpdate = true;
      };
      setBack();
      liveApi.current = { setBack };

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.022, 12, 96),
        new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.7, roughness: 0.35 })
      );
      ring.position.z = 0.08;
      group.add(ring);

      const s = {
        a: Math.random() * 0.5, hover: false, px: 0, py: 0,               // card mode
        rx: 0, ry: 0, vx: 0, vy: 0, zoom: 1, auto: !reduce, target: null, // viewer mode
      };
      const ptrs = new Map();
      let pinch = 0;
      const halt = () => { s.auto = false; s.target = null; };

      // card: tilt toward the pointer
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        s.px = ((e.clientX - r.left) / r.width) * 2 - 1;
        s.py = ((e.clientY - r.top) / r.height) * 2 - 1;
        s.hover = true;
      };
      const onLeave = () => { s.hover = false; s.px = s.py = 0; };

      // viewer: drag to turn to any angle, pinch or scroll to zoom
      const clampZoom = (z) => Math.min(2.6, Math.max(0.6, z));
      const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const onDown = (e) => {
        el.setPointerCapture?.(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        halt();
        s.vx = s.vy = 0;
        if (ptrs.size === 2) pinch = dist();
      };
      const onDrag = (e) => {
        const p = ptrs.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (ptrs.size === 2) {
          const d = dist();
          if (pinch) s.zoom = clampZoom(s.zoom * (d / pinch));
          pinch = d;
        } else {
          s.vy = dx * 0.012; s.vx = dy * 0.012;
          s.ry += s.vy; s.rx += s.vx;
        }
      };
      const onUp = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
      const onWheel = (e) => { e.preventDefault(); halt(); s.zoom = clampZoom(s.zoom * Math.exp(-e.deltaY * 0.0015)); };
      const onKey = (e) => {
        const step = { ArrowLeft: [0, -0.2], ArrowRight: [0, 0.2], ArrowUp: [-0.2, 0], ArrowDown: [0.2, 0] }[e.key];
        if (step) { e.preventDefault(); halt(); s.rx += step[0]; s.ry += step[1]; }
        else if (e.key === '+' || e.key === '=') { halt(); s.zoom = clampZoom(s.zoom * 1.15); }
        else if (e.key === '-') { halt(); s.zoom = clampZoom(s.zoom / 1.15); }
      };
      if (viewer) {
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onDrag);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('keydown', onKey);
        if (apiRef) {
          apiRef.current = {
            reset: () => {
              s.auto = false;
              s.vx = s.vy = 0;
              s.target = { rx: Math.round(s.rx / TAU) * TAU, ry: Math.round(s.ry / TAU) * TAU, zoom: 1 };
            },
          };
        }
      } else {
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerleave', onLeave);
      }

      const resize = () => { const w = el.clientWidth; if (w) renderer.setSize(w, w, false); };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const tint = new THREE.Color();
      const applyLook = () => {
        const L = lookRef.current;
        const b = L.brightness;
        hemi.intensity = L.ambient * b;
        sun.intensity = L.key * b;
        sun.color.copy(tint.setRGB(
          COOL[0] + (WARM[0] - COOL[0]) * L.warmth,
          COOL[1] + (WARM[1] - COOL[1]) * L.warmth,
          COOL[2] + (WARM[2] - COOL[2]) * L.warmth
        ));
        const az = L.azimuth * RAD, elev = L.elevation * RAD;
        sun.position.set(8 * Math.cos(elev) * Math.sin(az), 8 * Math.sin(elev), 8 * Math.cos(elev) * Math.cos(az));
        frontMat.emissiveIntensity = L.glow * b;
        frontMat.displacementScale = L.depth;
        frontMat.roughness = L.shine;
        return L;
      };

      let last = performance.now();
      let raf = 0;
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const L = applyLook();
        if (viewer) {
          if (ptrs.size === 0) {
            if (s.target) {
              s.rx += (s.target.rx - s.rx) * 0.12;
              s.ry += (s.target.ry - s.ry) * 0.12;
              s.zoom += (s.target.zoom - s.zoom) * 0.12;
              if (Math.abs(s.target.ry - s.ry) < 0.002 && Math.abs(s.target.rx - s.rx) < 0.002) {
                s.target = null;
                s.auto = !reduce;
              }
            } else if (s.auto) {
              s.ry += dt * L.spin;
            } else {
              s.rx += s.vx; s.ry += s.vy;
              s.vx *= 0.94; s.vy *= 0.94;
            }
          }
          group.rotation.set(s.rx, s.ry, 0);
          cam.position.z = 5.6 / s.zoom;
        } else {
          if (s.hover || reduce) s.a += (Math.round(s.a / TAU) * TAU - s.a) * 0.12;
          else s.a += dt * L.spin;
          // dwell on the front, whip past the back
          const rot = s.a - (s.hover || reduce ? 0 : 0.9 * Math.sin(s.a));
          group.rotation.y += (rot + (s.hover ? s.px * 0.4 : 0) - group.rotation.y) * 0.25;
          group.rotation.x += ((s.hover ? s.py * 0.25 : 0) - group.rotation.x) * 0.12;
        }
        renderer.render(scene, cam);
      };
      raf = requestAnimationFrame(loop);

      live = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener('pointermove', viewer ? onDrag : onMove);
        el.removeEventListener('pointerleave', onLeave);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('keydown', onKey);
        if (apiRef) apiRef.current = null;
        liveApi.current = null;
        scene.traverse((o) => {
          o.geometry?.dispose();
          const m = o.material;
          if (m) {
            ['map', 'emissiveMap', 'displacementMap', 'normalMap', 'alphaMap'].forEach((k) => m[k]?.dispose());
            m.dispose();
          }
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    }

    function stop() {
      gen++;
      if (live) { live(); live = null; }
    }

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { rootMargin: '150px' });
    io.observe(el);
    return () => { io.disconnect(); stop(); };
  }, [dish.imageId, failed, viewer, apiRef]);

  const fallback = failed && (dish.imageId
    ? <img className="stage-img" src={`/api/images/${dish.imageId}`} alt={dish.name} />
    : <div className="stage-empty" aria-hidden="true">🍽</div>);

  if (viewer) {
    return (
      <div
        ref={box}
        className="stage viewer"
        tabIndex={0}
        role="group"
        aria-label={`3D view of ${dish.name}. Drag or use arrow keys to rotate, plus and minus to zoom.`}
      >
        {fallback}
      </div>
    );
  }
  return (
    <div
      ref={box}
      className="stage"
      role="button"
      tabIndex={0}
      aria-label={`View ${dish.name} in 3D`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } }}
    >
      {fallback}
      <small>Tap to explore in 3D</small>
    </div>
  );
}
