'use client';
import { useEffect, useRef, useState } from 'react';
import { buildMaps, cropSquare } from '@/lib/relief';

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

/**
 * A dish plate that turns in 3D. The WebGL scene is created only while the card is
 * on screen and destroyed when it scrolls away, so long menus stay fast.
 */
export default function Dish3D({ dish, currency, flipped, onToggle }) {
  const box = useRef(null);
  const flipRef = useRef(false);
  const [failed, setFailed] = useState(!dish.imageId);

  useEffect(() => { flipRef.current = flipped; }, [flipped]);

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
      scene.add(new THREE.HemisphereLight(0xffffff, 0x998877, 1.1));
      const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
      sun.position.set(-3, 4, 6);
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
      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(1.84, 1.84, 110, 110),
        new THREE.MeshStandardMaterial({
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
        })
      );
      front.position.z = 0.081;
      group.add(front);

      const backTex = new THREE.CanvasTexture(backCanvas(dish.name, `${currency}${dish.price}`));
      backTex.colorSpace = THREE.SRGBColorSpace;
      const back = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), new THREE.MeshBasicMaterial({ map: backTex }));
      back.rotation.y = Math.PI;
      back.position.z = -0.082;
      group.add(back);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.022, 12, 96),
        new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.7, roughness: 0.35 })
      );
      ring.position.z = 0.08;
      group.add(ring);

      const s = { a: Math.random() * 0.5, hover: false, px: 0, py: 0 };
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        s.px = ((e.clientX - r.left) / r.width) * 2 - 1;
        s.py = ((e.clientY - r.top) / r.height) * 2 - 1;
        s.hover = true;
      };
      const onLeave = () => { s.hover = false; s.px = s.py = 0; };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);

      const resize = () => { const w = el.clientWidth; if (w) renderer.setSize(w, w, false); };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let last = performance.now();
      let raf = 0;
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const flip = flipRef.current;
        if (flip) s.a += (Math.round((s.a - Math.PI) / TAU) * TAU + Math.PI - s.a) * 0.1;
        else if (s.hover || reduce) s.a += (Math.round(s.a / TAU) * TAU - s.a) * 0.12;
        else s.a += dt * 0.6;
        // dwell on the front, whip past the back
        const rot = s.a - (flip || s.hover || reduce ? 0 : 0.9 * Math.sin(s.a));
        group.rotation.y += (rot + (s.hover && !flip ? s.px * 0.4 : 0) - group.rotation.y) * 0.25;
        group.rotation.x += ((s.hover ? s.py * 0.25 : 0) - group.rotation.x) * 0.12;
        renderer.render(scene, cam);
      };
      raf = requestAnimationFrame(loop);

      live = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
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
  }, [dish.imageId, dish.name, dish.price, currency, failed]);

  return (
    <div
      ref={box}
      className="stage"
      role="button"
      tabIndex={0}
      aria-label={`Flip ${dish.name}`}
      aria-pressed={flipped}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      {failed && (dish.imageId
        ? <img className="stage-img" src={`/api/images/${dish.imageId}`} alt={dish.name} />
        : <div className="stage-empty" aria-hidden="true">🍽</div>)}
      <small>Tap to flip</small>
    </div>
  );
}
