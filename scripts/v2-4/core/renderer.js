import * as THREE from 'three';

export function createConfiguredRenderer({ canvas, onContextLost, onContextRestored } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio <= 1.5,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    onContextLost?.();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => onContextRestored?.());
  return renderer;
}

export function resizeRenderer(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
