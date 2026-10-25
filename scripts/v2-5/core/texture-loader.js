import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const sourceCache = new Map();
const failedUrls = new Set();
const MAX_TEXTURE_EDGE = 2048;

function fitTextureImage(image) {
  const width = image.naturalWidth || image.videoWidth || image.width || 0;
  const height = image.naturalHeight || image.videoHeight || image.height || 0;
  const longestEdge = Math.max(width, height);
  if (!width || !height || longestEdge <= MAX_TEXTURE_EDGE) return image;

  const scale = MAX_TEXTURE_EDGE / longestEdge;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function loadSource(url) {
  if (!sourceCache.has(url)) {
    sourceCache.set(url, new Promise((resolve, reject) => {
      loader.load(url, texture => {
        texture.image = fitTextureImage(texture.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      }, undefined, error => {
        failedUrls.add(url);
        console.warn(`[Tài nguyên ảnh] Không tải được: ${url}`, error);
        reject(error);
      });
    }));
  }
  return sourceCache.get(url);
}

// Texture được clone trước khi crop để nhiều khung dùng chung một ảnh không
// ghi đè repeat/offset của nhau. Dữ liệu ảnh gốc vẫn chỉ tải qua mạng một lần.
export function loadDisplayTexture(url, renderer, onLoad, onError) {
  if (!url) return Promise.resolve(null);
  return loadSource(url).then(source => {
    const texture = source.clone();
    texture.image = source.image;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    onLoad?.(texture);
    return texture;
  }).catch(error => {
    onError?.(error);
    return null;
  });
}

export function getTextureLoadAudit() {
  return Object.freeze({
    cachedSources: sourceCache.size,
    maxTextureEdge: MAX_TEXTURE_EDGE,
    failedUrls: [...failedUrls]
  });
}
