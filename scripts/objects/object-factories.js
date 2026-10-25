import * as THREE from "three";

const standard = (color, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(geometry, material, position, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

// Bản nội bộ của tủ kính dùng tại sảnh trước Ver 2.
function glassShowcase() {
  const group = new THREE.Group();
  const length = 9.2, depth = 1.72, baseH = 1.05, glassH = 2.45;
  const wood = standard(0x7a5733, 0.68, 0.04);
  const white = standard(0xf4f7f9, 0.62, 0.02);
  const brass = standard(0xd6b86f, 0.3, 0.62);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdff1fb,
    roughness: 0.04,
    transparent: true,
    opacity: 0.22,
    transmission: 0.48,
    clearcoat: 1,
    side: THREE.DoubleSide
  });

  mesh(new THREE.BoxGeometry(depth, baseH, length), wood, [0, baseH / 2, 0], group);
  mesh(new THREE.BoxGeometry(depth - 0.12, 0.3, length - 0.18), white, [0, baseH + 0.15, 0], group);
  const gy = baseH + 0.3 + glassH / 2;
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.035, glassH, length - 0.42), glass, [s * (depth / 2 - 0.1), gy, 0], group));
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(depth - 0.2, glassH, 0.035), glass, [0, gy, s * (length / 2 - 0.2)], group));
  mesh(new THREE.BoxGeometry(depth - 0.2, 0.04, length - 0.4), glass, [0, baseH + 0.3 + glassH, 0], group);
  [-1, 1].forEach(x => [-1, 1].forEach(z => {
    mesh(new THREE.BoxGeometry(0.055, glassH, 0.055), brass, [x * (depth / 2 - 0.08), gy, z * (length / 2 - 0.12)], group);
  }));
  [-3.3, -1.1, 1.1, 3.3].forEach((z, i) => {
    mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 32), brass, [0, baseH + 0.38, z], group);
    const shape = i % 2 ? new THREE.OctahedronGeometry(0.4) : new THREE.IcosahedronGeometry(0.38, 1);
    const exhibit = mesh(shape, standard(0xffffff, 0.38, 0.06), [0, baseH + 0.85, z], group);
    exhibit.rotation.set(0.28, i * 0.55, 0.18);
  });
  return group;
}

// Bản nội bộ của bàn tra cứu thấp tại điểm chuyển tiếp hai nửa hành lang.
function researchKiosk() {
  const group = new THREE.Group();
  const navy = standard(0x102f4a, 0.36, 0.18);
  const wood = standard(0x76502e, 0.68, 0.04);
  const brass = standard(0xd7b56b, 0.28, 0.62);
  const screen = new THREE.MeshStandardMaterial({
    color: 0x083b63,
    emissive: 0x0b5f8d,
    emissiveIntensity: 0.36,
    roughness: 0.22,
    metalness: 0.18
  });

  mesh(new THREE.BoxGeometry(2.9, 0.14, 1.72), brass, [0, 0.07, 0], group);
  mesh(new THREE.BoxGeometry(2.72, 0.1, 1.56), navy, [0, 0.16, 0], group);
  mesh(new THREE.BoxGeometry(1.62, 1.08, 0.86), wood, [0, 0.68, 0.06], group);
  mesh(new THREE.BoxGeometry(1.42, 0.9, 0.7), navy, [0, 0.78, -0.1], group);
  const displayFrame = mesh(new THREE.BoxGeometry(3.05, 0.15, 1.96), navy, [0, 1.42, -0.02], group);
  displayFrame.rotation.x = -0.38;
  const display = mesh(new THREE.BoxGeometry(2.75, 0.035, 1.66), screen, [0, 1.49, 0.12], group);
  display.rotation.x = -0.38;
  const goldLine = mesh(new THREE.BoxGeometry(2.48, 0.018, 0.035), brass, [0, 1.77, 0.22], group);
  goldLine.rotation.x = -0.38;
  return group;
}

export const OBJECT_FACTORIES = {
  glassShowcase,
  researchKiosk
};
