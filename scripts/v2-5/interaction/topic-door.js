import * as THREE from 'three';

export function createTopicDoorState() {
    return {
        door: null,
        transition: null,
        controlsLocked: false
    };
}

export function registerTopicDoor(state, door) {
    state.door = door;
    door.openProgress = 0;
    door.targetOpenProgress = 0;
    door.isOpen = false;
    return door;
}

export function openTopicDoor(state, door = state.door) {
    if (!door || state.transition) return false;
    door.isOpen = true;
    door.targetOpenProgress = 1;
    return true;
}

function setDoorOpenProgress(door, progress) {
    door.openProgress = THREE.MathUtils.clamp(progress, 0, 1);
    door.leftPivot.rotation.y = -Math.PI * 0.5 * door.openProgress;
    door.rightPivot.rotation.y = Math.PI * 0.5 * door.openProgress;
    if (door.previewMaterials) {
        const opacity = THREE.MathUtils.smoothstep(door.openProgress, 0.25, 0.92);
        door.previewMaterials.forEach((material) => {
            material.opacity = opacity;
            material.needsUpdate = true;
        });
    }
}

export function updateTopicDoorOpening(state, delta) {
    const door = state.door;
    if (!door || state.transition) return;
    const target = door.targetOpenProgress || 0;
    const progress = THREE.MathUtils.damp(door.openProgress, target, 5.8, delta);
    setDoorOpenProgress(door, Math.abs(progress - target) < 0.002 ? target : progress);
}

export function tryStartTopicDoorTransition(state, camera) {
    const door = state.door;
    if (!door?.isOpen || door.openProgress < 0.88 || state.transition) return false;
    const dx = camera.position.x - door.entryPoint.x;
    const dz = camera.position.z - door.entryPoint.z;
    if (dx * dx + dz * dz > door.entryRadiusSq) return false;

    state.controlsLocked = true;
    state.transition = {
        elapsed: 0,
        duration: door.transitionDuration || 1.85,
        door,
        fromPoint: camera.position.clone()
    };
    return true;
}

export function updateTopicDoorTransition(state, camera, delta, overlay) {
    const transition = state.transition;
    if (!transition) return false;
    transition.elapsed += delta;

    const { door } = transition;
    setDoorOpenProgress(
        door,
        door.openProgress + (1 - door.openProgress) * THREE.MathUtils.smoothstep(transition.elapsed, 0.04, 0.72)
    );

    const moveProgress = THREE.MathUtils.smoothstep(transition.elapsed, 0.14, 1.35);
    if (moveProgress < 0.72) {
        camera.position.lerpVectors(transition.fromPoint, door.insidePoint, moveProgress / 0.72);
    } else {
        camera.position.lerpVectors(door.insidePoint, door.exitPoint, (moveProgress - 0.72) / 0.28);
    }
    camera.lookAt(door.exitPoint.x, door.exitPoint.y, door.exitPoint.z - 2);

    if (transition.elapsed >= 0.9) overlay?.classList.add('show');
    if (transition.elapsed >= transition.duration) window.location.href = door.targetUrl;
    return true;
}

export function resetTopicDoor(state, overlay) {
    if (state.door) {
        state.door.isOpen = false;
        state.door.targetOpenProgress = 0;
        setDoorOpenProgress(state.door, 0);
    }
    state.transition = null;
    state.controlsLocked = false;
    overlay?.classList.remove('show');
}

