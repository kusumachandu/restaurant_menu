'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Text, useToast } from '@chakra-ui/react';
import { BOWL, prepareDish } from '@/lib/dishMesh';
import { cutUrl, imgUrl } from '@/lib/img';
import { C } from './menu/ui';

const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

let scriptReady;
const loadModelViewer = () => {
  if (!scriptReady) {
    scriptReady = customElements.get('model-viewer') ? Promise.resolve() : new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = MODEL_VIEWER;
      s.onload = resolve;
      s.onerror = () => { scriptReady = null; reject(new Error('model-viewer failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptReady;
};

// Dishes without an uploaded 3D model get one built from the photo: the dish lying on the table, about 24 cm across.
async function buildPhotoModel(dish) {
  const [THREE, { GLTFExporter }] = await Promise.all([import('three'), import('three/examples/jsm/exporters/GLTFExporter.js')]);
  const img = new Image();
  img.src = dish.cutout ? cutUrl(dish.imageId, 800) : imgUrl(dish.imageId, 800);
  await img.decode();
  const prep = prepareDish(THREE, img, dish.cutout);
  const photo = new THREE.CanvasTexture(prep.texture);
  photo.colorSpace = THREE.SRGBColorSpace;

  const top = new THREE.Mesh(prep.geometry, new THREE.MeshStandardMaterial({ map: photo, alphaTest: 0.5, roughness: 0.6 }));
  const under = new THREE.Mesh(prep.underside, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55 }));

  // Lay it flat (the photo's up becomes the table's far side) and resting on the table.
  const scale = 0.24 / prep.size;
  const dish3d = new THREE.Group();
  dish3d.add(top, under);
  dish3d.rotation.x = -Math.PI / 2;
  const root = new THREE.Group();
  root.add(dish3d);
  root.scale.setScalar(scale);
  root.position.y = BOWL * scale;
  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  photo.dispose();
  return new Blob([glb], { type: 'model/gltf-binary' });
}

/**
 * "View on your table" button. The model is prepared in the background so the tap itself can open AR
 * straight away (phones only allow that from a direct tap):
 *  - a dish with an uploaded .glb uses it;
 *  - otherwise the dish shape is built from its photo.
 * Android opens WebXR / Scene Viewer, iPhone opens AR Quick Look.
 */
export default function ArButton({ dish }) {
  const toast = useToast();
  const holder = useRef(null);
  const viewer = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | unsupported | error

  useEffect(() => {
    let dead = false;
    let blobUrl = null;
    (async () => {
      try {
        await loadModelViewer();
        let src;
        if (dish.modelId) src = `${location.origin}${imgUrl(dish.modelId)}`;
        else blobUrl = URL.createObjectURL(await buildPhotoModel(dish));
        if (dead) return;
        const mv = document.createElement('model-viewer');
        mv.setAttribute('src', src || blobUrl);
        mv.setAttribute('alt', dish.name);
        mv.setAttribute('ar', '');
        mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        mv.setAttribute('ar-placement', 'floor');
        mv.setAttribute('ar-scale', dish.modelId ? 'auto' : 'fixed');
        mv.setAttribute('shadow-intensity', '1');
        mv.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
        holder.current.appendChild(mv);
        viewer.current = mv;
        await new Promise((resolve, reject) => {
          mv.addEventListener('load', resolve, { once: true });
          mv.addEventListener('error', () => reject(new Error('model failed to load')), { once: true });
        });
        await mv.updateComplete;
        if (!dead) setState(mv.canActivateAR ? 'ready' : 'unsupported');
      } catch {
        if (!dead) setState('error');
      }
    })();
    return () => {
      dead = true;
      viewer.current?.remove();
      viewer.current = null;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [dish.modelId, dish.imageId, dish.cutout, dish.name]);

  function open() {
    if (state === 'ready') { viewer.current.activateAR(); return; }
    toast({
      status: 'info', duration: 5000, isClosable: true, position: 'top',
      title: state === 'unsupported' ? 'Open this menu on your phone' : 'AR is not available right now',
      description: state === 'unsupported' ? 'AR works on recent iPhones and Android phones, over a secure (https) link.' : 'Please try again in a moment.',
    });
  }

  return (
    <Box>
      <Box ref={holder} position="relative" />
      <Button
        variant="unstyled" display="flex" alignItems="center" justifyContent="center" w="100%" h="48px" onClick={open} isDisabled={state === 'loading'}
        border="1px solid" borderColor={C.gold} borderRadius="99px" color={C.goldSoft} fontSize="13px" letterSpacing=".1em" textTransform="uppercase"
        _hover={{ bg: 'rgba(212,168,75,.12)' }} _disabled={{ opacity: 0.55, cursor: 'wait' }}
      >
        <span aria-hidden="true">📱&nbsp;&nbsp;</span>{state === 'loading' ? 'Preparing AR…' : 'View on your table'}
      </Button>
      {dish.modelId && state === 'ready' && <Text fontSize="12px" color={C.mute} textAlign="center" mt={1}>Real 3D model, pinch to resize on your table</Text>}
    </Box>
  );
}
