import * as THREE from 'three';

// Đảo vật liệu theo phương án hiện tại: tường bọc thảm xanh, sàn trắng.
export const ARCHITECTURE_COLORS = Object.freeze({
  wall: 0x141793,
  wallEmissive: 0x090b43,
  ceiling: 0xfffbf2,
  floor: 0xf7f7f4,
  trim: 0xb87333,
  baseboard: 0xf7f5f0,
  baseboardGrout: 0xcad5df
});

// Họa tiết thảm được chuyển nguyên từ museumCarpetTex của cd5_ver_2_3.
function createMuseumCarpetTexture(repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#141793';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(68,72,184,.24)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let y = -step; y < height + step; y += step) {
    for (let x = -step; x < width + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y + step / 2); ctx.lineTo(x + step / 2, y);
      ctx.lineTo(x + step, y + step / 2); ctx.lineTo(x + step / 2, y + step);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

export function createCircularArchitectureMaterials() {
  const wallTexture = createMuseumCarpetTexture(1.15, 3.2);
  const createCarpetWallMaterial = () => new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallTexture,
    roughness: 1,
    metalness: 0,
    emissive: ARCHITECTURE_COLORS.wallEmissive,
    emissiveIntensity: .035
  });
  return {
    floor: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.floor, roughness: .92, metalness: 0,
      side: THREE.DoubleSide
    }),
    wall: createCarpetWallMaterial(),
    innerWall: createCarpetWallMaterial(),
    trim: new THREE.MeshStandardMaterial({ color: ARCHITECTURE_COLORS.trim, roughness: .3, metalness: .55 }),
    baseboard: new THREE.MeshStandardMaterial({ color: ARCHITECTURE_COLORS.baseboard, roughness: .72, metalness: .02 }),
    baseboardGrout: new THREE.MeshStandardMaterial({ color: ARCHITECTURE_COLORS.baseboardGrout, roughness: .82, metalness: 0 }),
    ceiling: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.ceiling, roughness: .88,
      emissive: 0xfff6d8, emissiveIntensity: .04, side: THREE.DoubleSide
    })
  };
}
