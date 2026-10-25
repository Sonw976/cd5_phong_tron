import * as THREE from "three";
import { AUDIO_ASSETS } from "./assets.js";

export const UI_FONT = "'Roboto','Arial','Helvetica',sans-serif";

export const LOOK_SENS = 0.0032;
export const PITCH_LIMIT = 1.3;
// Xuất phát phía trong phòng, ngay trước cửa chính và nhìn vào không gian trưng bày.
export const SPAWN_POS = Object.freeze({ x: 0, z: -30.35 });
export const EYE_Y = 2.5;
// Thu chiều cao phòng còn đúng 3/4 so với khung Chủ đề 3 (10,5 → 7,875).
export const WALL_H = 7.875;
export const MARGIN = 0.55;

export const RED = 0xe3000f;
export const BLUE = 0x005baa;
export const GREEN = 0x009688;
export const GOLD = 0xfff200;

// Trụ trung tâm rộng bằng 3/2 phiên bản trước: 11,5 × 1,5 = 17,25.
export const R_CORE = 17.25;
// Nới tường ngoài để giữ ảnh lớn nhưng luôn có khe hở, không chồng lên nhau.
export const R_OUTER = 31.5;
export const WALL_THICK = 0.4;
// Vách phân khu chạy từ tường ngoài vào 2,4 đơn vị; hành lang vòng ở giữa vẫn thông suốt.
export const BOUNDARY_WALL_LENGTH = 2.4;
export const BOUNDARY_GAP = Object.freeze({ r0: R_CORE, r1: R_OUTER - BOUNDARY_WALL_LENGTH });
export const FRAME_DEPTH = 0.12;
export const WALL_MOUNT_GAP = 0.15;
export const WALL_MOUNT_R = R_OUTER - WALL_THICK / 2 - WALL_MOUNT_GAP - FRAME_DEPTH / 2;
export const MID_R = (R_CORE + R_OUTER) / 2;
// Cửa chiếm khoảng 16,6°. Ba cung tường hữu dụng xấp xỉ 156° / 73° / 115°.
export const BOUNDARIES = Object.freeze([
  THREE.MathUtils.degToRad(74),
  THREE.MathUtils.degToRad(147)
]);

const zoneDefinitions = [
  {
    id: 1,
    name: "Bí thư Đoàn trường qua các thời kỳ",
    color: RED,
    // Phiên bản LTR: bắt đầu ngay bên trái lối vào và đi về phía Cụm 2.
    a0: -Math.PI / 2,
    a1: THREE.MathUtils.degToRad(74),
    audio: AUDIO_ASSETS.zone1,
    track: ""
  },
  {
    id: 2,
    name: "Hiệu trưởng Nhà trường qua các thời kỳ",
    color: GREEN,
    a0: THREE.MathUtils.degToRad(74),
    a1: THREE.MathUtils.degToRad(147),
    audio: AUDIO_ASSETS.zone2,
    track: ""
  },
  {
    id: 3,
    name: "Bí thư Đảng ủy Nhà trường qua các thời kỳ",
    color: BLUE,
    // Phiên bản LTR: kết thúc hành trình ở phía phải lối vào.
    a0: THREE.MathUtils.degToRad(147),
    a1: Math.PI * 3 / 2,
    audio: AUDIO_ASSETS.zone3,
    track: ""
  }
];

export const ZONES = Object.freeze(zoneDefinitions.map(zone => Object.freeze({
  ...zone,
  mid: (zone.a0 + zone.a1) / 2
})));

export function getZoneById(id) {
  const zone = ZONES.find(item => item.id === id);
  if (!zone) throw new Error(`Không tìm thấy cấu hình Cụm ${id}`);
  return zone;
}
