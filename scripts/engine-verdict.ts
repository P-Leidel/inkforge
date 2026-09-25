/**
 * Runs the milestone 1 engine stress tests headless and prints the numbers
 * for the engine verdict (ADR 0001), plus the cost of contacts at rest.
 * Physics is deterministic, so the tunnelling, stacking and stability
 * results hold on any machine; step times depend on this machine, and the
 * frame rate must still be read from the F1 overlay in Chrome on a
 * mid-range laptop.
 *
 *   npm run verdict
 */
import os from 'node:os';
import { capsuleOverlapsPolygon } from '../src/geometry/overlap';
import { transformPoints } from '../src/geometry/transform';
import type { Vec2 } from '../src/geometry/vec2';
import type { Colour } from '../src/materials/colour';
import { GRAVITY, SandboxWorld, STEP_SECONDS } from '../src/sandbox/sandbox-world';
import { BallCannon } from '../src/stress-tests/ball-cannon';
import { BoxTower } from '../src/stress-tests/box-tower';
import { PebbleDrop } from '../src/stress-tests/pebble-drop';
import { dragAlong, dragBox, dragCircle, dragPolygon } from '../src/stroke/pointer-paths';

const SEED = 2026;

function withWorld<T>(run: (world: SandboxWorld) => T): T {
  const world = new SandboxWorld({ seed: SEED });
  try {
    return run(world);
  } finally {
    world.dispose();
  }
}

function tunnelling() {
  return withWorld((world) => {
    const cannon = new BallCannon(world);
    for (let shot = 0; shot < 1000; shot++) {
      cannon.fire();
      for (let step = 0; step < BallCannon.STEPS_PER_SHOT; step++) {
        world.step();
        cannon.track();
      }
    }
    return { fired: cannon.fired, reached: cannon.reachedLine, tunnelled: cannon.tunnelled };
  });
}

function stacking() {
  return withWorld((world) => {
    const tower = new BoxTower(world);
    const steps = Math.round(62 / STEP_SECONDS);
    for (let step = 0; step < steps; step++) {
      world.step();
      tower.update();
    }
    return {
      settleTime: tower.settleTime,
      maxDrift: tower.maxDrift,
      standing: tower.standing,
      standingFor: tower.standingFor,
    };
  });
}

function pebbles() {
  return withWorld((world) => {
    const drop = new PebbleDrop(world);
    const stepTimes: number[] = [];
    for (let step = 0; step < Math.round(10 / STEP_SECONDS); step++) {
      const t0 = performance.now();
      world.step();
      stepTimes.push(performance.now() - t0);
      drop.update();
    }
    stepTimes.sort((a, b) => a - b);
    const mean = stepTimes.reduce((s, t) => s + t, 0) / stepTimes.length;
    return {
      pebbles: world.objects.length,
      bodies: world.bodyCount,
      meanStepMs: mean,
      p99StepMs: stepTimes[Math.floor(stepTimes.length * 0.99)]!,
      maxStepMs: stepTimes[stepTimes.length - 1]!,
      settleTime: drop.settleTime,
      maxSpeed: drop.maxSpeed,
      freeFallSpeed: drop.freeFallSpeed,
    };
  });
}

/** Line-over-Object push-out: the largest speed beyond what gravity explains. */
function pushOut() {
  const shapes: [() => Vec2[], number][] = [
    [() => dragBox(370, 400, 60, 60), 60],
    [() => dragBox(340, 400, 120, 40), 40],
    [() => dragCircle({ x: 400, y: 430 }, 30), 60],
    [() => dragCircle({ x: 400, y: 460 }, 60), 120],
    [
      () =>
        dragPolygon([
          { x: 350, y: 480 },
          { x: 450, y: 480 },
          { x: 400, y: 400 },
        ]),
      80,
    ],
  ];
  let worstExcess = 0;
  let cases = 0;
  let stuck = 0;
  for (const [draw, height] of shapes) {
    for (const depth of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      withWorld((world) => {
        world.submitStroke(draw(), 'grey');
        const y = 400 + height * depth;
        world.submitStroke(
          dragAlong([
            { x: 250, y },
            { x: 550, y },
          ]),
          'grey',
        );
        world.togglePause();
        for (let step = 1; step <= 180; step++) {
          world.step();
          const v = world.objects[0]!.velocity;
          worstExcess = Math.max(worstExcess, Math.hypot(v.x, v.y) - GRAVITY * step * STEP_SECONDS);
        }
        const object = world.objects[0]!;
        const line = world.lines[0]!;
        const overlapping = line.segments.some((s) =>
          object.parts.some((part) =>
            capsuleOverlapsPolygon(s.a, s.b, 4, transformPoints(part, object.transform)),
          ),
        );
        cases++;
        if (overlapping) stuck++;
      });
    }
  }
  return { cases, stuck, worstExcess };
}

/** Wake-on-hit: momentum after the waking hit / momentum before, at several speeds. */
function wakeMomentum() {
  const ratios: number[] = [];
  for (const speed of [300, 600, 1200, 3000]) {
    withWorld((world) => {
      const box = world.submitStroke(dragBox(600, 400, 60, 60), 'grey');
      const ball = world.submitStroke(dragCircle({ x: 485, y: 430 }, 15), 'grey');
      if (box.kind !== 'object' || ball.kind !== 'object') throw new Error('set-up failed');
      world.togglePause();
      world.release(ball.id, { x: speed, y: 0 });
      for (let step = 0; step < 18; step++) world.step();
      const [b, c] = [box.id, ball.id].map((id) => world.objects.find((o) => o.id === id)!);
      ratios.push((c!.mass * c!.velocity.x + b!.mass * b!.velocity.x) / (c!.mass * speed));
    });
  }
  return ratios;
}

/**
 * Contacts at rest: a Rubble pile at the cap, resting in a tray of black
 * Lines on black blocks and on the grey boxes that didn't break. Grey-filled
 * boxes dropped into the tray break into the pebbles. Once all is still,
 * physics is paused and started again, so it starts with every contact in
 * the pile Settled. Times the whole Sandbox world step (physics, contacts
 * and damage) for 10 s.
 */
function restingPile() {
  return withWorld((world) => {
    const tray = world.submitStroke(
      dragAlong([
        { x: 400, y: 560 },
        { x: 400, y: 760 },
        { x: 800, y: 760 },
        { x: 800, y: 560 },
      ]),
      'black',
    );
    if (tray.kind !== 'line') throw new Error('set-up failed');
    const draw = (x: number, y: number, width: number, height: number, colour: Colour) => {
      const object = world.submitStroke(dragBox(x, y, width, height), colour);
      if (object.kind !== 'object') throw new Error('set-up failed');
      return object.id;
    };
    const blocks = [440, 580, 720].map((x) => draw(x - 25, 700, 50, 55, 'black'));
    const boxes = Array.from({ length: 12 }, (_, k) => {
      const x = 445 + (k % 4) * 100;
      const y = 60 + Math.floor(k / 4) * 120;
      const box = draw(x - 35, y, 70, 70, 'grey');
      world.fillAt({ x, y: y + 35 }, 'grey');
      return box;
    });
    world.togglePause();
    for (const id of [...blocks, ...boxes]) world.release(id);
    for (let step = 0; step < Math.round(5 / STEP_SECONDS); step++) world.step();
    world.togglePause();
    world.togglePause();
    const stepTimes: number[] = [];
    for (let step = 0; step < Math.round(10 / STEP_SECONDS); step++) {
      const t0 = performance.now();
      world.step();
      stepTimes.push(performance.now() - t0);
    }
    stepTimes.sort((a, b) => a - b);
    const mean = stepTimes.reduce((s, t) => s + t, 0) / stepTimes.length;
    return {
      rubble: world.rubble.length,
      objects: world.objects.length,
      bodies: world.bodyCount,
      meanStepMs: mean,
      p99StepMs: stepTimes[Math.floor(stepTimes.length * 0.99)]!,
      maxStepMs: stepTimes[stepTimes.length - 1]!,
    };
  });
}

const t = tunnelling();
const s = stacking();
const p = pebbles();
const push = pushOut();
const wake = wakeMomentum();
const rest = restingPile();

const f = (n: number | null, digits = 2) => (n === null ? 'never' : n.toFixed(digits));
console.log(`Engine verdict measurements (Phaser Box2D, headless, seed ${SEED})`);
console.log(
  `Machine: ${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.cpus().length} cores, Node ${process.version}\n`,
);
console.log('1. Tunnelling (3000 px/s balls vs 4 px Line)');
console.log(`   ${t.fired} fired, ${t.reached} reached the Line, ${t.tunnelled} passed through\n`);
console.log('2. Stacking (tower of 10 drawn 60 px boxes, 62 s simulated)');
console.log(
  `   settled after ${f(s.settleTime)} s; jitter since then ${f(s.maxDrift)} px; ` +
    `${s.standing ? `standing for ${s.standingFor.toFixed(1)} s` : `FELL after ${s.standingFor.toFixed(1)} s`}\n`,
);
console.log('3. Performance (100 drawn pebbles, 10 s simulated; physics step only)');
console.log(
  `   ${p.pebbles} pebbles, ${p.bodies} bodies; step ${f(p.meanStepMs)} ms mean, ` +
    `${f(p.p99StepMs)} ms p99, ${f(p.maxStepMs)} ms max (budget at 60 fps: 16.7 ms per frame)\n`,
);
console.log('4. Stability');
console.log(
  `   pebbles: fastest ${f(p.maxSpeed, 0)} px/s vs free fall ${f(p.freeFallSpeed, 0)} px/s; ` +
    `pile settled after ${f(p.settleTime, 1)} s`,
);
console.log(
  `   Line push-out: ${push.stuck}/${push.cases} stuck; largest speed beyond gravity ${f(push.worstExcess, 0)} px/s`,
);
console.log(
  `   wake-on-hit momentum after/before: ${wake.map((r) => r.toFixed(3)).join(', ')} (300…3000 px/s)\n`,
);
console.log('5. Contacts at rest (Rubble pile at the cap, restarted; whole Sandbox world step)');
console.log(
  `   ${rest.rubble} Rubble, ${rest.objects} Objects, ${rest.bodies} bodies; step ${f(rest.meanStepMs, 3)} ms mean, ` +
    `${f(rest.p99StepMs, 3)} ms p99, ${f(rest.maxStepMs, 3)} ms max`,
);
