/**
 * Fixes two bugs in Phaser Box2D 1.1.0 (ADR 0001). Runs on `npm install`
 * (postinstall). Safe to run again.
 *
 * - b2DestroyWorld builds a fresh b2World for the destroyed world's slot but
 *   never puts it back, so the slot stays in use and a process can only ever
 *   create 32 worlds. With the fix, the physics module can throw a world
 *   away and start a fresh one, which Reset needs to replay a run exactly.
 * - Finalizing a step sets a body's `rotation0.x` and `.y`, which a rotation
 *   doesn't have (it has `c` and `s`), so the rotation a fast body's sweep
 *   starts from stays the one the body was created with. A body that turns
 *   and then moves fast enough for continuous collision jumped part of the
 *   way back to that angle in one step. With the fix, it sweeps from where it
 *   was at the start of the step.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(
  new URL('../node_modules/phaser-box2d/dist/PhaserBox2D.js', import.meta.url),
);

const patches = [
  {
    name: 'b2DestroyWorld frees its world slot',
    bug: `  world = new b2World();
  world.worldId = B2_NULL_INDEX;
  world.revision = revision + 1;
}`,
    fix: `  world = new b2World();
  world.worldId = B2_NULL_INDEX;
  world.revision = revision + 1;
  b2_worlds[worldId.index1 - 1] = world; // patched by inkforge: free the slot
}`,
    count: 1,
  },
  {
    name: 'a step keeps each body’s rotation at its start',
    bug: `sim.rotation0.x = sim.transform.q.x;
        sim.rotation0.y = sim.transform.q.y;`,
    fix: `sim.rotation0 = sim.transform.q.clone(); // patched by inkforge: a rotation is c and s`,
    count: 1,
  },
  {
    name: 'a sleepy step keeps each body’s rotation at its start',
    bug: `sim.rotation0.x = sim.transform.q.x;
      sim.rotation0.y = sim.transform.q.y;`,
    fix: `sim.rotation0 = sim.transform.q.clone(); // patched by inkforge: a rotation is c and s`,
    count: 1,
  },
];

let source = readFileSync(file, 'utf8');
for (const { name, bug, fix, count } of patches) {
  if (source.includes(fix) && !source.includes(bug)) {
    console.log(`phaser-box2d: already patched: ${name}`);
  } else if (source.split(bug).length === count + 1) {
    source = source.replace(bug, fix);
    console.log(`phaser-box2d: patched: ${name}`);
  } else {
    throw new Error(
      `phaser-box2d: the code for "${name}" is not as expected; check scripts/patch-phaser-box2d.mjs against this version`,
    );
  }
}
writeFileSync(file, source);
