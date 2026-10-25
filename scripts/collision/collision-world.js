(function (global) {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function create(options) {
    options = options || {};
    var radius = options.playerRadius || 0.38;
    var debug = Boolean(options.debug);
    var scene = options.scene || null;
    var colliders = [];
    var debugGroup = null;

    if (debug && scene && global.THREE) {
      debugGroup = new global.THREE.Group();
      debugGroup.name = "CollisionDebug";
      scene.add(debugGroup);
    }

    function addDebugMesh(collider) {
      if (!debugGroup) return;
      var color = collider.type === "decor" ? 0xff9f1c :
        collider.type === "column" ? 0x9b5de5 : 0xff3355;
      var mesh = new global.THREE.Mesh(
        new global.THREE.BoxGeometry(collider.width, 0.12, collider.depth),
        new global.THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.42,
          depthWrite: false
        })
      );
      mesh.position.set(collider.cx, 0.08, collider.cz);
      mesh.name = "Collider:" + collider.name;
      debugGroup.add(mesh);
    }

    function addBox(cx, cz, width, depth, metadata) {
      metadata = metadata || {};
      var collider = {
        cx: cx,
        cz: cz,
        width: width,
        depth: depth,
        minX: cx - width / 2,
        maxX: cx + width / 2,
        minZ: cz - depth / 2,
        maxZ: cz + depth / 2,
        type: metadata.type || "wall",
        name: metadata.name || "unnamed",
        enabled: metadata.enabled !== false
      };
      colliders.push(collider);
      addDebugMesh(collider);
      return collider;
    }

    function addFootprint(cx, cz, width, depth, rotationY, metadata) {
      var cos = Math.abs(Math.cos(rotationY || 0));
      var sin = Math.abs(Math.sin(rotationY || 0));
      var worldWidth = width * cos + depth * sin;
      var worldDepth = width * sin + depth * cos;
      return addBox(cx, cz, worldWidth, worldDepth, metadata);
    }

    function circleHitsBox(x, z, box) {
      if (!box.enabled) return false;
      var closestX = clamp(x, box.minX, box.maxX);
      var closestZ = clamp(z, box.minZ, box.maxZ);
      var dx = x - closestX;
      var dz = z - closestZ;
      return dx * dx + dz * dz < radius * radius;
    }

    function collidesAt(x, z) {
      for (var i = 0; i < colliders.length; i++) {
        if (circleHitsBox(x, z, colliders[i])) return true;
      }
      return false;
    }

    return {
      addBox: addBox,
      addFootprint: addFootprint,
      collidesAt: collidesAt,
      getColliders: function () { return colliders.slice(); },
      getPlayerRadius: function () { return radius; }
    };
  }

  global.CollisionWorld2D = { create: create };
})(window);
