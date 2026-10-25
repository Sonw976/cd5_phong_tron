import * as THREE from 'three';

// Bảng màu riêng cho phương án LTR. Không dùng chung với bản cd3_1.html để
// việc thử nghiệm ngôn ngữ xanh chàm - gold không làm đổi phương án gốc.
export const ARCHITECTURE_COLORS = Object.freeze({
  wall: 0x141793,
  wallEmissive: 0x090b43,
  ceiling: 0xfffbf2,
  floor: 0x8fa9bb,
  trim: 0xc6a447,
  patternGold: 0xd4af37,
  baseboard: 0xf7f5f0,
  baseboardGrout: 0xcad5df
});

function createIndigoGoldWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#141793';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Vân dệt rất nhẹ: chỉ tạo chiều sâu khi quan sát gần.
  ctx.strokeStyle = 'rgba(104,112,205,.045)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 12) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.15, 2.2);
  texture.needsUpdate = true;
  return texture;
}

export function createCircularArchitectureMaterials() {
  const wallTexture = createIndigoGoldWallTexture();
  const createWallMaterial = () => new THREE.MeshStandardMaterial({
    // Hệ đèn phòng có cường độ cao; sắc xám trung tính này giữ màu texture
    // gần #141793 thay vì làm xanh chàm bị phát sáng thành xanh điện.
    color: 0x929292,
    map: wallTexture,
    roughness: .82,
    metalness: .015,
    emissive: ARCHITECTURE_COLORS.wallEmissive,
    emissiveIntensity: .075
  });

  return {
    floor: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.floor, roughness: .82, metalness: 0,
      side: THREE.DoubleSide
    }),
    wall: createWallMaterial(),
    innerWall: createWallMaterial(),
    trim: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.trim, roughness: .3, metalness: .58
    }),
    baseboard: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.baseboard, roughness: .72, metalness: .02
    }),
    baseboardGrout: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.baseboardGrout, roughness: .82, metalness: 0
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: ARCHITECTURE_COLORS.ceiling, roughness: .88,
      emissive: 0xfff6d8, emissiveIntensity: .04, side: THREE.DoubleSide
    })
  };
}
