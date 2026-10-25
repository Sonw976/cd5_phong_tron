import { angleDiff, normalizeAngle } from "../geometry/radial-geometry.js";

export function createRadialCollision(config) {
  const {
    rCore,
    rOuter,
    wallThickness,
    margin,
    boundaries,
    boundaryGap
  } = config;

  function isWalkable(x, z) {
    const radius = Math.hypot(x, z);
    const angle = normalizeAngle(Math.atan2(z, x));

    // Tường lõi đóng kín 360°.
    if (Math.abs(radius - rCore) < wallThickness + 0.3) {
      return false;
    }

    if (radius > rOuter - margin) return false;

    if (radius > rCore) {
      for (const boundaryAngle of boundaries) {
        const distance = angleDiff(angle, boundaryAngle);
        if (distance * radius < wallThickness + 0.3) {
          if (!(radius >= boundaryGap.r0 && radius <= boundaryGap.r1)) return false;
        }
      }
    }
    return true;
  }

  function resolveMovement(oldX, oldZ, newX, newZ) {
    if (isWalkable(newX, newZ)) return { x: newX, z: newZ };
    const oldRadius = Math.hypot(oldX, oldZ) || 0.0001;
    const radialX = oldX / oldRadius;
    const radialZ = oldZ / oldRadius;
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const dx = newX - oldX;
    const dz = newZ - oldZ;
    const radialComponent = dx * radialX + dz * radialZ;
    const tangentComponent = dx * tangentX + dz * tangentZ;

    const tangentOnlyX = oldX + tangentX * tangentComponent;
    const tangentOnlyZ = oldZ + tangentZ * tangentComponent;
    if (isWalkable(tangentOnlyX, tangentOnlyZ)) return { x: tangentOnlyX, z: tangentOnlyZ };

    const radialOnlyX = oldX + radialX * radialComponent;
    const radialOnlyZ = oldZ + radialZ * radialComponent;
    if (isWalkable(radialOnlyX, radialOnlyZ)) return { x: radialOnlyX, z: radialOnlyZ };

    return { x: oldX, z: oldZ };
  }

  return Object.freeze({ isWalkable, resolveMovement });
}
