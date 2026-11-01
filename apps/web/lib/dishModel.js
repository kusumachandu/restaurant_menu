// Loads a dish's uploaded 3D model (.glb). Scanning apps often export compressed files, so Draco and meshopt are supported.
let loader;

async function getLoader() {
  if (!loader) {
    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** @returns the model's root object, ready to add to a scene */
export async function loadDishModel(url) {
  const gltf = await (await getLoader()).loadAsync(url);
  return gltf.scene;
}
