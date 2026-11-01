"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Image as ChakraImage, Text } from "@chakra-ui/react";

import { prepareDish, DOME } from "@/lib/dishMesh";
import { resolveLook } from "@/lib/look";
import { cutUrl, depthUrl, imgSrcSet, imgUrl } from "@/lib/img";
import { loadDishModel } from "@/lib/dishModel";

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

const MAX_TILT = 0.95;
const MAX_TURN = 1.15;

const RETURN_AFTER = 1400;
const MODEL_TILT = 0.42;
const MODEL_RESUME = 2500;

const COOL = [0.87, 0.92, 1];
const WARM = [1, 0.85, 0.66];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const disposeMaterial = (material) => {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    Object.values(mat).forEach((value) => {
      if (value?.isTexture) {
        value.dispose();
      }
    });

    mat.dispose();
  });
};

const disposeObject = (root) => {
  if (!root) return;

  root.traverse((object) => {
    object.geometry?.dispose();
    disposeMaterial(object.material);
  });
};

export default function Dish3D({
  dish,
  currency,
  look,
  mode = "card",
  onOpen,
  apiRef,
  width = "100%",
  priority = false,
  hint = true,
  interactive = true,
  useModel,
}) {
  const boxRef = useRef(null);

  const lookRef = useRef(resolveLook(look));

  const [failed, setFailed] = useState(!dish.imageId && !dish.modelId);

  const [modelFailed, setModelFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const viewer = mode === "viewer";

  const hasImage = Boolean(dish.imageId);
  const hasModel = Boolean(dish.modelId);

  const wantsModel = hasModel && (useModel ?? viewer);
  const asModel = wantsModel && !modelFailed;

  const hasFallback = hasImage && !failed;

  lookRef.current = resolveLook(look);

  useEffect(() => {
    const el = boxRef.current;

    if (!el) return undefined;

    let generation = 0;
    let starting = false;
    let liveCleanup = null;

    let disposed = false;

    const stop = () => {
      generation++;

      starting = false;

      if (liveCleanup) {
        liveCleanup();
        liveCleanup = null;
      }
    };

    async function start() {
      if (starting || liveCleanup || disposed) return;

      starting = true;

      const currentGeneration = ++generation;

      let THREE;
      let image = null;
      let depthImage = null;
      let modelRoot = null;
      let renderer = null;
      let scene = null;
      let environmentTexture = null;

      const isCurrent = () => !disposed && currentGeneration === generation;

      try {
        // Load the image or GLB model.
        if (asModel) {
          const results = await Promise.all([
            import("three"),
            loadDishModel(imgUrl(dish.modelId)),
          ]);

          THREE = results[0];
          modelRoot = results[1];
        } else if (hasImage && !failed) {
          image = new Image();

          image.src = dish.cutout
            ? cutUrl(dish.imageId, viewer ? 800 : 480)
            : imgUrl(dish.imageId, viewer ? 800 : 480);

          // The depth map is optional: without it the shape comes from the outline alone.
          const loadDepth = () => {
            if (!dish.depth) return null;

            const map = new Image();

            map.src = depthUrl(dish.imageId, 512);

            return map.decode().then(
              () => map,
              () => null,
            );
          };

          const results = await Promise.all([
            import("three"),
            image.decode(),
            loadDepth(),
          ]);

          THREE = results[0];
          depthImage = results[2];
        } else {
          if (isCurrent()) {
            setFailed(true);
          }

          return;
        }

        // The component may have left the viewport during loading.
        if (!isCurrent()) {
          disposeObject(modelRoot);
          return;
        }

        // Create WebGL renderer.
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        renderer.outputColorSpace = THREE.SRGBColorSpace;

        if (asModel) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.05;
        }

        el.insertBefore(renderer.domElement, el.firstChild);

        scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

        const baseZ = viewer ? 5.2 : 4.5;

        camera.position.z = baseZ;

        // Lighting.
        const hemi = new THREE.HemisphereLight(0xffffff, 0x998877, 1.1);

        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);

        scene.add(sun);

        const group = new THREE.Group();

        scene.add(group);

        let frontMat = null;
        let front = null;
        let body = null;

        if (asModel) {
          // Normalize and center the GLB model.
          const bounds = new THREE.Box3().setFromObject(modelRoot);

          const size = bounds.getSize(new THREE.Vector3());

          const center = bounds.getCenter(new THREE.Vector3());

          modelRoot.position.sub(center);

          const pivot = new THREE.Group();

          pivot.add(modelRoot);

          const maxDimension = Math.max(size.x, size.y, size.z, 1e-6);

          pivot.scale.setScalar(1.75 / maxDimension);

          group.add(pivot);

          // Studio environment.
          const pmrem = new THREE.PMREMGenerator(renderer);

          try {
            const { RoomEnvironment } =
              await import("three/examples/jsm/environments/RoomEnvironment.js");

            if (!isCurrent()) {
              disposeObject(modelRoot);
              renderer.dispose();
              renderer.forceContextLoss();
              renderer.domElement.remove();
              return;
            }

            const room = new RoomEnvironment();

            const environment = pmrem.fromScene(room, 0.04);

            environmentTexture = environment.texture;

            scene.environment = environmentTexture;
            scene.environmentIntensity = 0.9;

            room.dispose?.();
          } finally {
            pmrem.dispose();
          }
        } else {
          // Photo-based 3D dish.
          const prepared = prepareDish(THREE, image, dish.cutout, 512, 1.9, {
            depth: depthImage,
            grid: viewer ? 190 : 112,
          });

          const photo = new THREE.CanvasTexture(prepared.texture);

          photo.colorSpace = THREE.SRGBColorSpace;
          photo.anisotropy = 4;

          frontMat = new THREE.MeshStandardMaterial({
            map: photo,
            emissive: 0xffffff,
            emissiveMap: photo,
            emissiveIntensity: 0.6,
            alphaTest: 0.5,
            alphaToCoverage: true,
            roughness: 0.65,
          });

          front = new THREE.Mesh(prepared.geometry, frontMat);

          group.add(front);

          const bodyMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            alphaMap: new THREE.CanvasTexture(prepared.mask),
            alphaTest: 0.5,
            roughness: 0.5,
            emissive: 0x2a1c12,
          });

          body = new THREE.Mesh(prepared.underside, bodyMat);

          group.add(body);
        }

        if (!isCurrent()) {
          disposeObject(scene);
          environmentTexture?.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          return;
        }

        // Respect reduced-motion preferences.
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        const state = {
          angle: Math.random() * 0.5,
          hover: false,
          px: 0,
          py: 0,

          rx: asModel ? MODEL_TILT : 0,
          ry: 0,

          vx: 0,
          vy: 0,

          zoom: 1,

          auto: !reduceMotion,
          target: null,
          time: 0,
        };

        const pointers = new Map();

        let pinchDistance = 0;
        let settleTimer = null;

        const halt = () => {
          state.auto = false;
          state.target = null;

          clearTimeout(settleTimer);
        };

        // Card mode pointer interaction.
        const onMove = (event) => {
          const rect = el.getBoundingClientRect();

          if (!rect.width || !rect.height) return;

          state.px = ((event.clientX - rect.left) / rect.width) * 2 - 1;

          state.py = ((event.clientY - rect.top) / rect.height) * 2 - 1;

          state.hover = true;
        };

        const onLeave = () => {
          state.hover = false;
          state.px = 0;
          state.py = 0;
        };

        // Viewer mode interaction.
        const distance = () => {
          if (pointers.size !== 2) return 0;

          const [a, b] = [...pointers.values()];

          return Math.hypot(a.x - b.x, a.y - b.y);
        };

        const onDown = (event) => {
          if (event.button !== undefined && event.button !== 0) {
            return;
          }

          event.preventDefault();

          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture may not be available.
          }

          pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });

          halt();

          state.vx = 0;
          state.vy = 0;

          if (pointers.size === 2) {
            pinchDistance = distance();
          }
        };

        const onDrag = (event) => {
          const pointer = pointers.get(event.pointerId);

          if (!pointer) return;

          const dx = event.clientX - pointer.x;
          const dy = event.clientY - pointer.y;

          pointer.x = event.clientX;
          pointer.y = event.clientY;

          if (pointers.size === 2) {
            const currentDistance = distance();

            if (pinchDistance > 0 && currentDistance > 0) {
              state.zoom = clamp(
                state.zoom * (currentDistance / pinchDistance),
                0.6,
                2.6,
              );
            }

            pinchDistance = currentDistance;
          } else {
            state.vy = dx * 0.012;
            state.vx = dy * 0.012;

            state.ry += state.vy;
            state.rx += state.vx;
          }
        };

        const onUp = (event) => {
          pointers.delete(event.pointerId);

          pinchDistance = 0;

          try {
            if (el.hasPointerCapture(event.pointerId)) {
              el.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Ignore capture release errors.
          }

          if (pointers.size > 0) return;

          clearTimeout(settleTimer);

          if (asModel) {
            settleTimer = setTimeout(() => {
              if (!disposed && isCurrent()) {
                state.auto = !reduceMotion;
              }
            }, MODEL_RESUME);
          } else {
            settleTimer = setTimeout(() => {
              if (!disposed && isCurrent()) {
                state.vx = 0;
                state.vy = 0;

                state.target = {
                  rx: 0,
                  ry: 0,
                  zoom: state.zoom,
                };
              }
            }, RETURN_AFTER);
          }
        };

        const onWheel = (event) => {
          event.preventDefault();

          halt();

          state.zoom = clamp(
            state.zoom * Math.exp(-event.deltaY * 0.0015),
            0.6,
            2.6,
          );
        };

        const onKey = (event) => {
          const rotation = {
            ArrowLeft: [0, -0.2],
            ArrowRight: [0, 0.2],
            ArrowUp: [-0.2, 0],
            ArrowDown: [0.2, 0],
          };

          const step = rotation[event.key];

          if (step) {
            event.preventDefault();
            halt();

            state.rx += step[0];
            state.ry += step[1];
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            halt();

            state.zoom = clamp(state.zoom * 1.15, 0.6, 2.6);
          } else if (event.key === "-") {
            event.preventDefault();
            halt();

            state.zoom = clamp(state.zoom / 1.15, 0.6, 2.6);
          }
        };

        if (viewer) {
          el.addEventListener("pointerdown", onDown);
          el.addEventListener("pointermove", onDrag);
          el.addEventListener("pointerup", onUp);
          el.addEventListener("pointercancel", onUp);
          el.addEventListener("lostpointercapture", onUp);
          el.addEventListener("wheel", onWheel, {
            passive: false,
          });
          el.addEventListener("keydown", onKey);

          if (apiRef) {
            apiRef.current = {
              reset: () => {
                halt();

                state.vx = 0;
                state.vy = 0;

                state.target = {
                  rx: asModel ? MODEL_TILT : 0,
                  ry: asModel ? Math.round(state.ry / TAU) * TAU : 0,
                  zoom: 1,
                };
              },
            };
          }
        } else {
          el.addEventListener("pointermove", onMove);
          el.addEventListener("pointerleave", onLeave);
        }

        // Responsive renderer.
        const resize = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;

          if (!w || !h) return;

          renderer.setSize(w, h, false);

          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };

        const resizeObserver = new ResizeObserver(resize);

        resizeObserver.observe(el);

        resize();

        // Live lighting controls.
        const tint = new THREE.Color();

        const applyLook = () => {
          const L = lookRef.current;

          const brightness = L.brightness;
          const multiplier = asModel ? 0.3 : 1;

          hemi.intensity = L.ambient * brightness * multiplier;

          sun.intensity = L.key * brightness * multiplier * 1.4;

          sun.color.copy(
            tint.setRGB(
              COOL[0] + (WARM[0] - COOL[0]) * L.warmth,
              COOL[1] + (WARM[1] - COOL[1]) * L.warmth,
              COOL[2] + (WARM[2] - COOL[2]) * L.warmth,
            ),
          );

          const azimuth = L.azimuth * RAD;
          const elevation = L.elevation * RAD;

          sun.position.set(
            8 * Math.cos(elevation) * Math.sin(azimuth),
            8 * Math.sin(elevation),
            8 * Math.cos(elevation) * Math.cos(azimuth),
          );

          if (frontMat) {
            const rise = Math.max(0.05, L.depth / DOME);

            frontMat.emissiveIntensity = L.glow * brightness;

            frontMat.roughness = L.shine;

            front.scale.z = rise;
            body.scale.z = rise;
          }

          return L;
        };

        // Animation loop.
        let lastTime = performance.now();
        let animationFrame = 0;

        const loop = (now) => {
          if (!isCurrent()) return;

          animationFrame = requestAnimationFrame(loop);

          const dt = Math.min(0.05, (now - lastTime) / 1000);

          lastTime = now;

          const L = applyLook();

          if (viewer) {
            if (pointers.size === 0) {
              if (state.target) {
                state.rx += (state.target.rx - state.rx) * 0.12;

                state.ry += (state.target.ry - state.ry) * 0.12;

                state.zoom += (state.target.zoom - state.zoom) * 0.12;

                if (
                  Math.abs(state.target.rx - state.rx) < 0.002 &&
                  Math.abs(state.target.ry - state.ry) < 0.002 &&
                  Math.abs(state.target.zoom - state.zoom) < 0.002
                ) {
                  state.rx = state.target.rx;
                  state.ry = state.target.ry;
                  state.zoom = state.target.zoom;

                  state.target = null;
                  state.auto = !reduceMotion;
                  state.time = 0;
                }
              } else if (state.auto && asModel) {
                state.ry += dt * L.spin * 0.8;
              } else if (state.auto) {
                state.time += dt * L.spin;

                state.ry = Math.sin(state.time * 1.3) * 0.55;

                state.rx = Math.sin(state.time * 0.8) * 0.14;
              } else {
                state.rx += state.vx;
                state.ry += state.vy;

                state.vx *= 0.94;
                state.vy *= 0.94;
              }
            }

            // Photo-based dishes have restricted rotation.
            if (!asModel) {
              if (Math.abs(state.rx) > MAX_TILT) {
                state.rx = Math.sign(state.rx) * MAX_TILT;

                state.vx = 0;
              }

              if (Math.abs(state.ry) > MAX_TURN) {
                state.ry = Math.sign(state.ry) * MAX_TURN;

                state.vy = 0;
              }
            }

            group.rotation.set(state.rx, state.ry, 0);

            camera.position.z = baseZ / state.zoom;
          } else {
            if (!reduceMotion) {
              state.angle += dt * L.spin;
            }

            const sway = reduceMotion ? 0 : Math.sin(state.angle * 1.4) * 0.38;

            group.rotation.y +=
              (sway + (state.hover ? state.px * 0.5 : 0) - group.rotation.y) *
              0.15;

            group.rotation.x +=
              ((asModel ? MODEL_TILT : 0) +
                Math.sin(state.angle * 0.9) * (reduceMotion ? 0 : 0.1) +
                (state.hover ? state.py * 0.3 : 0) -
                group.rotation.x) *
              0.15;
          }

          renderer.render(scene, camera);
        };

        animationFrame = requestAnimationFrame(loop);

        renderer.render(scene, camera);

        if (isCurrent()) {
          setReady(true);
        }

        // All scene resources are owned by this cleanup.
        liveCleanup = () => {
          cancelAnimationFrame(animationFrame);

          clearTimeout(settleTimer);

          resizeObserver.disconnect();

          el.removeEventListener("pointermove", viewer ? onDrag : onMove);
          el.removeEventListener("pointerleave", onLeave);

          el.removeEventListener("pointerdown", onDown);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onUp);
          el.removeEventListener("lostpointercapture", onUp);
          el.removeEventListener("wheel", onWheel);
          el.removeEventListener("keydown", onKey);

          for (const pointerId of pointers.keys()) {
            try {
              if (el.hasPointerCapture(pointerId)) {
                el.releasePointerCapture(pointerId);
              }
            } catch {
              // Ignore pointer cleanup errors.
            }
          }

          pointers.clear();

          if (apiRef) {
            apiRef.current = null;
          }

          scene.traverse((object) => {
            object.geometry?.dispose();
            disposeMaterial(object.material);
          });

          environmentTexture?.dispose();

          renderer.dispose();
          renderer.forceContextLoss();

          renderer.domElement.remove();

          if (isCurrent()) {
            setReady(false);
          }
        };
      } catch (error) {
        if (isCurrent()) {
          console.error("Dish3D initialization failed:", error);

          if (asModel) {
            setModelFailed(true);
          } else {
            setFailed(true);
          }
        }

        // Dispose partially initialized resources.
        if (scene) disposeObject(scene);

        environmentTexture?.dispose();

        if (!scene) disposeObject(modelRoot);

        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        }
      } finally {
        if (isCurrent()) {
          starting = false;
        }
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
        } else {
          stop();
        }
      },
      {
        rootMargin: "150px",
      },
    );

    observer.observe(el);

    return () => {
      disposed = true;

      observer.disconnect();

      stop();
    };
  }, [
    dish.imageId,
    dish.cutout,
    dish.depth,
    dish.modelId,
    asModel,
    failed,
    viewer,
    hasImage,
    apiRef,
  ]);

  // Image fallback.
  const cut = Boolean(dish.cutout && !failed);

  const fallback = hasImage ? (
    <ChakraImage
      src={cut ? cutUrl(dish.imageId, 480) : imgUrl(dish.imageId, 480)}
      srcSet={cut ? undefined : imgSrcSet(dish.imageId)}
      sizes="(max-width: 600px) 90vw, 300px"
      alt={failed ? dish.name : ""}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      position={failed ? "static" : "absolute"}
      inset={failed ? undefined : cut ? "3%" : "6%"}
      w={failed ? "100%" : cut ? "94%" : "88%"}
      h={failed ? "100%" : cut ? "94%" : "88%"}
      objectFit={cut ? "contain" : "cover"}
      borderRadius={cut ? 0 : "50%"}
      opacity={ready ? 0 : 1}
      transition="opacity .25s"
      pointerEvents="none"
    />
  ) : (
    <Box
      h="100%"
      display="grid"
      placeItems="center"
      fontSize="64px"
      aria-hidden="true"
    >
      🍽
    </Box>
  );

  const stageProps = {
    ref: boxRef,
    aspectRatio: 1,
    borderRadius: "18px",
    position: "relative",
    cursor: "pointer",
    style: {
      touchAction: viewer ? "none" : "pan-y",
    },
    bg: "radial-gradient(closest-side at 50% 48%, rgba(212,168,75,.20), transparent)",
    sx: {
      "& canvas": {
        width: "100%",
        height: "100%",
        display: "block",
      },
    },
  };

  // Full-screen viewer.
  if (viewer) {
    return (
      <Box
        {...stageProps}
        w={width}
        mx="auto"
        cursor="grab"
        userSelect="none"
        _active={{ cursor: "grabbing" }}
        tabIndex={0}
        role="group"
        aria-label={`3D view of ${dish.name}. Drag or use arrow keys to rotate, plus and minus to zoom.`}
      >
        {fallback}
      </Box>
    );
  }

  // Card mode.
  return (
    <Box
      {...stageProps}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `View ${dish.name} in 3D`,
            onClick: onOpen,
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen?.();
              }
            },
          }
        : {
            cursor: "inherit",
          })}
    >
      {fallback}

      {hint && (
        <Text
          as="small"
          position="absolute"
          right="10px"
          bottom="8px"
          color="mute"
          fontSize="12px"
        >
          Tap to explore in 3D
        </Text>
      )}
    </Box>
  );
}
