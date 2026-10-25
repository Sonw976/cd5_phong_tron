import * as THREE from "three";

// Biểu tượng nổi dùng chính kênh alpha của ảnh để không còn nền hoặc khung tròn cũ.
export function createEmbossedLogo(
  imageSrc,
  position = [0, 0, 0],
  radius = 1,
  rotationY = 0,
  parent = null,
  onTextureLoaded = null
) {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = rotationY;
  if (parent) parent.add(group);

  new THREE.TextureLoader().load(imageSrc, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    const imageWidth = texture.image?.naturalWidth || texture.image?.width || 1;
    const imageHeight = texture.image?.naturalHeight || texture.image?.height || 1;
    const aspect = imageWidth / imageHeight;
    const maxSize = radius * 2.28;
    const width = aspect >= 1 ? maxSize : maxSize * aspect;
    const height = aspect >= 1 ? maxSize / aspect : maxSize;
    const geometry = new THREE.PlaneGeometry(width, height);

    // Các lớp tối mỏng chồng sát nhau tạo cạnh nổi theo đúng silhouette alpha.
    const depth = 0.105;
    const layers = 7;
    for (let index = 0; index < layers; index += 1) {
      const layer = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.035,
          color: 0x5d5144,
          roughness: 0.48,
          metalness: 0.18,
          side: THREE.DoubleSide,
          depthWrite: true
        })
      );
      layer.position.z = -depth + index * (depth / layers);
      layer.renderOrder = 5;
      group.add(layer);
    }

    const face = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.035,
        roughness: 0.38,
        metalness: 0.04,
        side: THREE.DoubleSide,
        depthWrite: true
      })
    );
    face.position.z = 0.018;
    face.renderOrder = 6;
    group.add(face);

    if (typeof onTextureLoaded === "function") onTextureLoaded(group, face);
  }, undefined, () => {});

  group.userData.embossedLogo = { imageSrc, radius };
  return group;
}
