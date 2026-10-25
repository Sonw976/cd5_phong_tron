import * as THREE from "three";

export function normalizeAngle(angle) {
  let normalized = angle % (Math.PI * 2);
  if (normalized < 0) normalized += Math.PI * 2;
  return normalized;
}

export function angleDiff(a, b) {
  let difference = Math.abs(a - b) % (Math.PI * 2);
  if (difference > Math.PI) difference = Math.PI * 2 - difference;
  return difference;
}

export function zonePoint(zone, angleFraction, radius) {
  const angle = zone.a0 + (zone.a1 - zone.a0) * angleFraction;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle };
}

export function faceCoreRotY(angle) {
  return -angle - Math.PI / 2;
}

export function createSRGBCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function bendGeometry(geometry, radius) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const theta = x / radius;
    position.setXYZ(
      i,
      (radius - z) * Math.sin(theta),
      y,
      radius - (radius - z) * Math.cos(theta)
    );
  }
  geometry.computeVertexNormals();
}

function createAnnularSectorGeometry(rInner, rOuter, a0, a1, steps) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = a0 + (a1 - a0) * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(cos * rInner, 0, sin * rInner, cos * rOuter, 0, sin * rOuter);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < steps; i++) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    const i3 = i0 + 3;
    indices.push(i0, i2, i1, i1, i2, i3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildRingFloor(rInner, rOuter, a0, a1, material, steps, parent) {
  const mesh = new THREE.Mesh(createAnnularSectorGeometry(rInner, rOuter, a0, a1, steps), material);
  parent.add(mesh);
  return mesh;
}

export function createAnnularSectorMesh(rInner, rOuter, a0, a1, y, material, steps, parent) {
  const mesh = new THREE.Mesh(createAnnularSectorGeometry(rInner, rOuter, a0, a1, steps), material);
  mesh.position.y = y;
  parent.add(mesh);
  return mesh;
}

export function createArcFascia(radius, a0, a1, yBottom, yTop, material, steps, parent) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const angle = a0 + (a1 - a0) * i / steps;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, yBottom, z, x, yTop, z);
  }
  for (let i = 0; i < steps; i++) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    const i3 = i0 + 3;
    indices.push(i0, i1, i2, i2, i1, i3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}
