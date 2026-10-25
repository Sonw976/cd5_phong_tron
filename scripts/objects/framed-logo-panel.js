import * as THREE from "three";

export function createFramedLogoPanel(
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

  const backing = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.18, 72),
    new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.62, metalness: 0.02 })
  );
  backing.position.z = -0.035;
  group.add(backing);

  const outerFrame = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.08, radius * 0.075, 12, 96),
    new THREE.MeshStandardMaterial({ color: 0xd6b86f, roughness: 0.28, metalness: 0.7 })
  );
  outerFrame.position.z = 0.025;
  group.add(outerFrame);

  const innerFrame = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.86, radius * 0.035, 10, 96),
    new THREE.MeshStandardMaterial({ color: 0xb89262, roughness: 0.24, metalness: 0.66 })
  );
  innerFrame.position.z = 0.055;
  group.add(innerFrame);

  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.82, 72),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.02, transparent: true })
  );
  logo.position.z = 0.09;
  group.add(logo);

  new THREE.TextureLoader().load(imageSrc, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const imageWidth = texture.image?.naturalWidth || texture.image?.width || 1;
    const imageHeight = texture.image?.naturalHeight || texture.image?.height || 1;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    if (imageWidth > imageHeight) {
      texture.repeat.set(imageHeight / imageWidth, 1);
      texture.offset.set((1 - texture.repeat.x) / 2, 0);
    } else if (imageHeight > imageWidth) {
      texture.repeat.set(1, imageWidth / imageHeight);
      texture.offset.set(0, (1 - texture.repeat.y) / 2);
    }
    texture.needsUpdate = true;
    logo.material.map = texture;
    logo.material.needsUpdate = true;
    if (typeof onTextureLoaded === "function") onTextureLoaded(group, logo);
  }, undefined, () => {});

  group.userData.logoPanel = { imageSrc, radius };
  return group;
}
