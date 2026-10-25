export function collectSceneAudit(scene, interactiveObjects, renderer, textureAudit = {}) {
  const counts = { objects: 0, meshes: 0, lights: 0, materials: 0, geometries: 0 };
  const materials = new Set();
  const geometries = new Set();
  const issues = [];
  scene.traverse(object => {
    counts.objects += 1;
    if (object.isMesh) {
      counts.meshes += 1;
      if (object.geometry) geometries.add(object.geometry.uuid);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.filter(Boolean).forEach(material => materials.add(material.uuid));
    }
    if (object.isLight) counts.lights += 1;
  });
  counts.materials = materials.size;
  counts.geometries = geometries.size;
  interactiveObjects.forEach((object, index) => {
    if (!object?.parent) issues.push(`Interactive #${index} không thuộc scene graph`);
    if (!object?.userData?.type) issues.push(`Interactive #${index} thiếu userData.type`);
  });
  return {
    counts,
    interactiveObjects: interactiveObjects.length,
    renderer: renderer ? {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries
    } : null,
    textures: textureAudit,
    issues
  };
}
