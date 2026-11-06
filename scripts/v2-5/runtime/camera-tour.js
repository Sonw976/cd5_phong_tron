const lerp = (a, b, t) => a + (b - a) * t;
const shortestAngle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function number(value, fallback, min, max, label) {
    const result = value === undefined ? fallback : value;
    if (!Number.isFinite(result) || result < min || result > max) throw new Error(`Invalid ${label}: ${result}`);
    return result;
}

export function compileTour(script, targets, userView) {
    if (!Array.isArray(script?.shots) || !script.shots.length) throw new Error('Tour needs at least one shot');
    const defaults = script.defaults || {};
    const byCode = new Map(targets.map(target => [target.code, target]));
    let duration = 0;
    const shots = script.shots.map((shot, index) => {
        const target = byCode.get(shot.target);
        if (!target) throw new Error(`Unknown portrait: ${shot.target}`);
        const options = { ...defaults, ...shot };
        const distance = number(options.distance, 6, .5, 12, 'distance');
        const radius = target.radius + (target.surface === 'core' ? distance : -distance);
        if (radius < (target.minRadius ?? .5) || radius > (target.maxRadius ?? Infinity)) {
            throw new Error(`Camera leaves the gallery corridor at ${shot.target}`);
        }
        const move = number(options.move, 2.4, .01, 3600, 'move');
        const hold = number(options.hold, 1.2, 0, 3600, 'hold');
        const y = number(options.cameraY, target.y, .5, 7, 'cameraY');
        const lookY = number(options.lookY, target.y, .5, 7, 'lookY');
        const fov = number(options.fov, 50, 20, 90, 'fov');
        const lookAhead = number(options.lookAhead, 0, -60, 60, 'lookAhead') * Math.PI / 180;
        const cruiseSpeed = options.speed === undefined ? null : number(options.speed, 1, .05, 10, 'speed');
        if (options.easing !== undefined && !['linear', 'smooth'].includes(options.easing)) throw new Error('Invalid easing');
        const actions = shot.actions ?? [];
        if (!Array.isArray(actions) || actions.some(action => !['open-profile', 'close-profile', 'click'].includes(action.type)
            || (action.type === 'open-profile' && !byCode.has(action.target))
            || (action.type === 'click' && typeof action.selector !== 'string'))) throw new Error('Invalid shot actions');
        const start = duration;
        const travel = index === 0 ? 0 : move;
        duration += travel + hold;
        return { code: target.code, angle: target.angle, radius, y, fov, cruiseSpeed, hold,
            yaw: options.heading === 'corridor' ? Math.PI - target.angle
                : -target.angle - Math.PI / 2 + (target.surface === 'core' ? Math.PI + lookAhead : -lookAhead),
            pitch: Math.atan2(lookY - y, distance), easing: options.easing || 'smooth',
            start, arrival: start + travel, end: duration, actions };
    });
    for (let i = 1; i < shots.length; i++) {
        shots[i].angle = shots[i - 1].angle + shortestAngle(shots[i - 1].angle, shots[i].angle);
        shots[i].yaw = shots[i - 1].yaw + shortestAngle(shots[i - 1].yaw, shots[i].yaw);
        if (shots[i].cruiseSpeed !== null) {
            const previous = shots[i - 1];
            const arc = (shots[i].angle - previous.angle) * (shots[i].radius + previous.radius) / 2;
            const travel = Math.hypot(arc, shots[i].radius - previous.radius, shots[i].y - previous.y) / shots[i].cruiseSpeed;
            shots[i].arrival = shots[i].start + Math.max(travel, .01);
            shots[i].end = shots[i].arrival + shots[i].hold;
        }
        if (i + 1 < shots.length) {
            const offset = shots[i].end - shots[i + 1].start;
            shots[i + 1].start += offset; shots[i + 1].arrival += offset; shots[i + 1].end += offset;
        }
    }
    duration = shots.at(-1).end;
    if (duration <= 0) throw new Error('Tour duration must be positive');
    if (userView) {
        for (const key of ['x', 'z', 'y', 'yaw', 'pitch', 'fov']) {
            if (!Number.isFinite(userView[key])) throw new Error(`Invalid user camera ${key}`);
        }
        const first = shots[0];
        const radius = Math.hypot(userView.x, userView.z);
        const angle = Math.atan2(userView.z, userView.x);
        const angleOffset = angle + shortestAngle(angle, first.angle) - first.angle;
        const yawOffset = userView.yaw + shortestAngle(userView.yaw, first.yaw) - first.yaw;
        for (const shot of shots) {
            shot.angle += angleOffset; shot.yaw += yawOffset;
            shot.y = userView.y; shot.pitch = userView.pitch; shot.fov = userView.fov;
        }
        const distance = Math.hypot((first.angle - angle) * (radius + first.radius) / 2, first.radius - radius);
        const approach = Math.max(.5, distance / (first.cruiseSpeed || 2.5), Math.abs(first.yaw - userView.yaw) / .6);
        for (const shot of shots) { shot.start += approach; shot.arrival += approach; shot.end += approach; }
        // A virtual starting point keeps the first frame exactly at the user's camera.
        shots.unshift({ ...first, angle, radius, yaw: userView.yaw, start: 0, arrival: 0, end: 0, actions: [] });
        shots[1].start = 0;
        duration += approach;
    }
    return { shots, duration };
}

export function sampleTour(tour, seconds) {
    const time = Math.max(0, Math.min(tour.duration, seconds));
    const index = tour.shots.findIndex(shot => time < shot.end);
    const i = index < 0 ? tour.shots.length - 1 : index;
    const to = tour.shots[i];
    const from = tour.shots[Math.max(0, i - 1)];
    let t = to.arrival <= to.start ? 1 : Math.max(0, Math.min(1, (time - to.start) / (to.arrival - to.start)));
    // Quintic easing has zero velocity and acceleration at each portrait.
    if (to.easing === 'smooth') t = t * t * t * (t * (t * 6 - 15) + 10);
    const angle = lerp(from.angle, to.angle, t);
    const radius = lerp(from.radius, to.radius, t);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        y: lerp(from.y, to.y, t), yaw: lerp(from.yaw, to.yaw, t), pitch: lerp(from.pitch, to.pitch, t),
        fov: lerp(from.fov, to.fov, t), code: to.code, index: i, done: time >= tour.duration };
}

export async function installCameraTour({ targets, capturePose, enter, restore, applyPose, performAction }) {
    let tour = null, state = 'idle', elapsed = 0, speed = 1, lastTime = 0;
    let loadedScript = null;
    let nextActionShot = 0;
    const status = () => ({ state, elapsed, speed, duration: tour?.duration ?? 0,
        target: tour ? sampleTour(tour, elapsed).code : null });
    const draw = () => applyPose(sampleTour(tour, elapsed));
    const fireActions = () => {
        while (nextActionShot < tour.shots.length && tour.shots[nextActionShot].arrival <= elapsed) {
            for (const action of tour.shots[nextActionShot].actions) performAction(action);
            nextActionShot++;
        }
    };
    const api = {
        get active() { return state !== 'idle'; },
        get playing() { return state === 'playing'; },
        status,
        getTargets: () => targets.map(target => ({ ...target })),
        load(script) {
            const compiled = compileTour(script, targets);
            api.stop();
            loadedScript = script;
            tour = compiled;
            return status();
        },
        play(options = {}) {
            if (!tour) throw new Error('Load a tour first');
            speed = number(options.speed, 1, .05, 100, 'speed');
            enter();
            if (loadedScript.preserveUserView) tour = compileTour(loadedScript, targets, capturePose());
            elapsed = 0; nextActionShot = 0; lastTime = performance.now(); state = 'playing';
            draw(); fireActions();
            return status();
        },
        pause() { if (state === 'playing') { api.update(performance.now()); if (state === 'playing') state = 'paused'; } return status(); },
        resume() { if (state === 'paused') { lastTime = performance.now(); state = 'playing'; } return status(); },
        stop() { if (state !== 'idle') restore(); state = 'idle'; elapsed = 0; return status(); },
        seek(seconds) {
            if (!tour || state === 'idle') throw new Error('Play the tour before seeking');
            elapsed = number(seconds, 0, 0, tour.duration, 'seek');
            nextActionShot = tour.shots.filter(shot => shot.arrival <= elapsed).length;
            lastTime = performance.now(); state = 'paused'; draw(); return status();
        },
        update(time) {
            if (state !== 'playing') return;
            elapsed = Math.min(tour.duration, elapsed + Math.max(0, time - lastTime) / 1000 * speed);
            lastTime = time;
            draw(); fireActions();
            if (elapsed >= tour.duration) state = 'complete';
        }
    };
    const response = await fetch(new URL('../../../cinematic/tour.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Cannot load tour.json: HTTP ${response.status}`);
    api.load(await response.json());
    window.cameraTour = api;
    return api;
}
