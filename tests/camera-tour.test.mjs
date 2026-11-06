import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A chord interpolation would cut through the central pillar; angle interpolation must not.
const source = await readFile(new URL('../scripts/v2-5/runtime/camera-tour.js', import.meta.url), 'utf8').catch(() => '');
const { compileTour, sampleTour } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(typeof compileTour, 'function', 'camera tour compiler is required');
const targets = [
    { code: 'A', angle: 0, radius: 31, y: 3.7, surface: 'outer' },
    { code: 'B', angle: Math.PI, radius: 31, y: 3.7, surface: 'outer' }
];
const script = { defaults: { distance: 6, move: 4, hold: 2, fov: 50 }, shots: [{ target: 'A' }, { target: 'B' }] };
const tour = compileTour(script, targets);
const corridor = compileTour({ ...script, defaults: { ...script.defaults, heading: 'corridor' } }, targets);
const ahead = sampleTour(corridor, 0);
assert.ok(Math.abs(Math.sin(ahead.yaw)) < 1e-9);
assert.ok(-Math.cos(ahead.yaw) > .99, 'look along +Z corridor at angle zero, not into the +X wall');
const userView = { x: 0, z: -30, y: 2.5, yaw: Math.PI, pitch: -.12, fov: 68 };
const walking = compileTour(script, targets, userView);
const firstFrame = sampleTour(walking, 0);
for (const key of ['x', 'z', 'y', 'yaw', 'pitch', 'fov']) {
    assert.ok(Math.abs(firstFrame[key] - userView[key]) < 1e-9, `start at the user's ${key}`);
}
for (let t = 0; t <= walking.duration; t += .25) {
    const view = sampleTour(walking, t);
    assert.equal(view.y, 2.5, 'do not lift the camera to portrait height');
    assert.equal(view.pitch, -.12, 'keep the user tilt');
    assert.equal(view.fov, 68, 'keep the user lens');
    assert.ok(Math.hypot(view.x, view.z) >= 25 - 1e-9, 'approach the circular path without crossing the central pillar');
}
assert.equal(tour.duration, 8); // First frame is already at A: hold 2 + move 4 + hold 2.
assert.equal(sampleTour(tour, 1).code, 'A');
const mid = sampleTour(tour, 4);
assert.ok(Math.abs(Math.hypot(mid.x, mid.z) - 25) < 1e-9, 'stay on the circular rail');
assert.ok(Math.abs(mid.x) < 1e-9);
assert.ok(Math.abs(mid.z - 25) < 1e-9);
assert.equal(sampleTour(tour, 8).code, 'B');
assert.equal(sampleTour(tour, 800).done, true);
assert.throws(() => compileTour({ ...script, shots: [{ target: 'missing' }] }, targets), /missing/);
assert.throws(() => compileTour({ ...script, defaults: { ...script.defaults, move: -1 } }, targets));
assert.throws(() => compileTour({ ...script, shots: [] }, targets));
assert.throws(() => compileTour({ ...script, defaults: { ...script.defaults, distance: 40 } }, targets));

// Crossing the angle seam must turn a few degrees, not nearly a full revolution.
const seam = compileTour(script, [{ ...targets[0], angle: 3.1 }, { ...targets[1], angle: -3.1 }]);
assert.ok(Math.abs(sampleTour(seam, 6).yaw - sampleTour(seam, 0).yaw) < .1);

const config = JSON.parse(await readFile(new URL('../cinematic/tour.json', import.meta.url), 'utf8'));
const cruise = compileTour({ defaults: { distance: 6, hold: 0, easing: 'linear', speed: 2, lookAhead: 15 },
    shots: [{ target: 'A' }, { target: 'B' }] }, targets);
assert.ok(Math.abs(cruise.duration - 25 * Math.PI / 2) < 1e-9, 'cruise speed is distance per second');
assert.ok(Math.abs(sampleTour(cruise, 1).yaw - sampleTour(cruise, 0).yaw) > .01, 'keep moving immediately');
assert.ok(Math.abs(cruise.shots[1].yaw - tour.shots[1].yaw + Math.PI / 12) < 1e-9, 'look along the direction of travel');
const continuous = compileTour({ defaults: { distance: 6, hold: 0, easing: 'linear', speed: 2 },
    shots: [{target:'A'}, {target:'B'}, {target:'C'}] },
    [{...targets[0],angle:0}, {...targets[1],angle:.2}, {...targets[1],code:'C',angle:.7}]);
assert.ok(Math.abs(continuous.duration - 8.75) < 1e-9);
const junction = continuous.shots[1].arrival;
const left = sampleTour(continuous,junction-.01), center=sampleTour(continuous,junction), right=sampleTour(continuous,junction+.01);
assert.ok(Math.abs(Math.hypot(left.x-center.x,left.z-center.z)-.02)<1e-6);
assert.ok(Math.abs(Math.hypot(right.x-center.x,right.z-center.z)-.02)<1e-6, 'do not slow down at portrait boundaries');
assert.equal(config.defaults.hold, 0, 'default tour must never stop at each portrait');
assert.equal(config.defaults.easing, 'linear');
assert.ok(config.shots.every(shot => !shot.hold && !shot.move), 'no per-portrait pauses or speed resets');
const profileSource = await readFile(new URL('../scripts/data/profiles.js', import.meta.url), 'utf8');
const { PROFILE_DATA } = await import(`data:text/javascript;base64,${Buffer.from(profileSource).toString('base64')}`);
assert.equal(new Set(config.shots.map(s => s.target)).size, 61);
assert.deepEqual(config.shots.map(s => s.target).sort(), PROFILE_DATA.map(p => p.code).sort(), 'every portrait exactly once');
console.log('Camera tour checks passed: circular rail, timing, seam, validation, all 61 portraits.');
