'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Image as ChakraImage, Text } from '@chakra-ui/react';
import { BOWL, DOME, prepareDish } from '@/lib/dishMesh';
import { resolveLook } from '@/lib/look';
import { cutUrl, imgSrcSet, imgUrl } from '@/lib/img';

const TAU = Math.PI * 2;

const RAD = Math.PI / 180;
// A dish photographed from above only holds up as a solid object within a limited tilt, so the viewer turns it
// like a product on a stand rather than letting it spin to the grazing and underside angles.
const MAX_TILT = 0.95; // up/down, radians (about 54 degrees)
const MAX_TURN = 1.15; // left/right (about 66 degrees)
const RETURN_AFTER = 1400; // ms after letting go before it eases back to the front
const COOL = [0.87, 0.92, 1];
const WARM = [1, 0.85, 0.66];

/**
 * A dish photo in 3D. Two modes:
 *  - "card":   small, gently spinning, tilts toward the pointer; click opens the viewer.
 *  - "viewer": drag to turn it to any angle, pinch/scroll to zoom. Used in the menu's
 *              full-screen viewer and in the admin preview.
 * `look` (lighting settings) is read every frame, so sliders update live without
 * rebuilding the scene. The WebGL scene exists only while the element is on screen.
 */
export default function Dish3D({ dish, currency, look, mode = 'card', onOpen, apiRef, width = '100%', priority = false, hint = true, interactive = true }) {
  const box = useRef(null);
  const lookRef = useRef(resolveLook(look));
  const [failed, setFailed] = useState(!dish.imageId);
  const [ready, setReady] = useState(false);
  const viewer = mode === 'viewer';

  lookRef.current = resolveLook(look);

  useEffect(() => {
    if (failed || !box.current) return undefined;
    const el = box.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let live = null;
    let gen = 0;

    async function start() {
      const my = ++gen;
      // Load three.js and the photo in parallel. Cards need only a 480px texture.
      const img = new Image();
      img.src = dish.cutout ? cutUrl(dish.imageId, viewer ? 800 : 480) : imgUrl(dish.imageId, viewer ? 800 : 480);
      let THREE;
      try { [THREE] = await Promise.all([import('three'), img.decode()]); } catch { setFailed(true); return; }
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
      const baseZ = viewer ? 5.2 : 4.5;
      cam.position.z = baseZ;
      const hemi = new THREE.HemisphereLight(0xffffff, 0x998877, 1.1);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
      scene.add(sun);
      const group = new THREE.Group();
      scene.add(group);

      // The dish itself is the object: its outline puffed into a solid shape, with a dark underside.
      const prep = prepareDish(THREE, img, dish.cutout);
      const photo = new THREE.CanvasTexture(prep.texture);
      photo.colorSpace = THREE.SRGBColorSpace;
      photo.anisotropy = 4;
      const frontMat = new THREE.MeshStandardMaterial({
        map: photo,
        emissive: 0xffffff,
        emissiveMap: photo,
        emissiveIntensity: 0.6,
        alphaTest: 0.5,
        alphaToCoverage: true,
        roughness: 0.65,
      });
      const front = new THREE.Mesh(prep.geometry, frontMat);
      group.add(front);

      // The body under the food: a tapered bowl that wears the dish's own rim colours.
      const bodyMat = new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, alphaMap: new THREE.CanvasTexture(prep.mask), alphaTest: 0.5,
        roughness: 0.5, emissive: 0x2a1c12,
      });
      const body = new THREE.Mesh(prep.underside, bodyMat);
      group.add(body);

      const s = {
        a: Math.random() * 0.5, hover: false, px: 0, py: 0,               // card mode
        rx: 0, ry: 0, vx: 0, vy: 0, zoom: 1, auto: !reduce, target: null, t: 0, // viewer mode
      };
      const ptrs = new Map();
      let pinch = 0;
      let settle = 0;
      const halt = () => { s.auto = false; s.target = null; clearTimeout(settle); };

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
      const onUp = (e) => {
        ptrs.delete(e.pointerId); pinch = 0;
        if (!ptrs.size) { clearTimeout(settle); settle = setTimeout(() => { s.vx = s.vy = 0; s.target = { rx: 0, ry: 0, zoom: s.zoom }; }, RETURN_AFTER); }
      };
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
              s.target = { rx: 0, ry: 0, zoom: 1 };
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
        const rise = Math.max(0.05, L.depth / DOME);
        front.scale.z = rise;
        body.scale.z = rise; // the slider deepens the heap and the bowl together
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
                s.t = 0;
              }
            } else if (s.auto) {
              s.t += dt * L.spin; // idle: a slow sway that shows the dish is 3D
              s.ry = Math.sin(s.t * 1.3) * 0.55;
              s.rx = Math.sin(s.t * 0.8) * 0.14;
            } else {
              s.rx += s.vx; s.ry += s.vy;
              s.vx *= 0.94; s.vy *= 0.94;
            }
          }
          if (Math.abs(s.rx) > MAX_TILT) { s.rx = Math.sign(s.rx) * MAX_TILT; s.vx = 0; }
          if (Math.abs(s.ry) > MAX_TURN) { s.ry = Math.sign(s.ry) * MAX_TURN; s.vy = 0; }
          group.rotation.set(s.rx, s.ry, 0);
          cam.position.z = baseZ / s.zoom;
        } else {
          // gentle sway: the photo always faces the customer, turning a little toward the pointer
          if (!reduce) s.a += dt * L.spin;
          const sway = reduce ? 0 : Math.sin(s.a * 1.4) * 0.38;
          group.rotation.y += (sway + (s.hover ? s.px * 0.5 : 0) - group.rotation.y) * 0.15;
          group.rotation.x += (Math.sin(s.a * 0.9) * (reduce ? 0 : 0.1) + (s.hover ? s.py * 0.3 : 0) - group.rotation.x) * 0.15;
        }
        renderer.render(scene, cam);
      };
      raf = requestAnimationFrame(loop);
      renderer.render(scene, cam);
      setReady(true);

      live = () => {
        setReady(false);
        cancelAnimationFrame(raf);
        clearTimeout(settle);
        ro.disconnect();
        el.removeEventListener('pointermove', viewer ? onDrag : onMove);
        el.removeEventListener('pointerleave', onLeave);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('keydown', onKey);
        if (apiRef) apiRef.current = null;
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
  }, [dish.imageId, dish.cutout, failed, viewer, apiRef]);

  // The flat photo shows at once; once the 3D scene is live it fades out and the canvas takes over.
  const cut = dish.cutout && !failed;
  const fallback = dish.imageId
    ? (
      <ChakraImage
        src={cut ? cutUrl(dish.imageId, 480) : imgUrl(dish.imageId, 480)}
        srcSet={cut ? undefined : imgSrcSet(dish.imageId)} sizes="(max-width: 600px) 90vw, 300px"
        alt={failed ? dish.name : ''} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async"
        position={failed ? 'static' : 'absolute'} inset={failed ? undefined : (cut ? '3%' : '6%')}
        w={failed ? '100%' : (cut ? '94%' : '88%')} h={failed ? '100%' : (cut ? '94%' : '88%')}
        objectFit={cut ? 'contain' : 'cover'} borderRadius={cut ? 0 : '50%'}
        opacity={ready ? 0 : 1} transition="opacity .25s" pointerEvents="none"
      />
    )
    : <Box h="100%" display="grid" placeItems="center" fontSize="64px" aria-hidden="true">🍽</Box>;

  const stageProps = {
    ref: box,
    aspectRatio: 1,
    borderRadius: '18px',
    position: 'relative',
    cursor: 'pointer',
    style: { touchAction: 'pan-y' }, // let the page scroll vertically over a card
    bg: 'radial-gradient(closest-side at 50% 48%, rgba(212,168,75,.20), transparent)', // fades out before the edges, so no visible box
    sx: { '& canvas': { width: '100%', height: '100%', display: 'block' } },
  };

  if (viewer) {
    return (
      <Box
        {...stageProps}
        w={width}
        mx="auto"
        cursor="grab"
        style={{ touchAction: "none" }}
        userSelect="none"
        _active={{ cursor: 'grabbing' }}
        tabIndex={0}
        role="group"
        aria-label={`3D view of ${dish.name}. Drag or use arrow keys to rotate, plus and minus to zoom.`}
      >
        {fallback}
      </Box>
    );
  }
  return (
    <Box
      {...stageProps}
      {...(interactive ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `View ${dish.name} in 3D`,
        onClick: onOpen,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } },
      } : { cursor: 'inherit' })}
    >
      {fallback}
      {hint && <Text as="small" position="absolute" right="10px" bottom="8px" color="mute" fontSize="12px">Tap to explore in 3D</Text>}
    </Box>
  );
}
