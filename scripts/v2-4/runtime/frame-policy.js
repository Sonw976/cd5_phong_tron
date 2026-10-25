export function createAdaptiveFramePolicy({ activeFps = 60, idleFps = 12 } = {}) {
  let lastFrameAt = 0;
  let forceFrames = 2;

  function invalidate(frames = 2) {
    forceFrames = Math.max(forceFrames, frames);
  }

  function shouldRun(timeMs, active) {
    const fps = active || forceFrames > 0 ? activeFps : idleFps;
    if (timeMs - lastFrameAt < 1000 / fps) return false;
    lastFrameAt = timeMs;
    if (forceFrames > 0) forceFrames -= 1;
    return true;
  }

  return { invalidate, shouldRun };
}
