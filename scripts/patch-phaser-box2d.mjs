/**
 * Fixes Phaser Box2D 1.1.0's b2DestroyWorld, which builds a fresh b2World for
 * the destroyed world's slot but never puts it back, so the slot stays in use
 * and a process can only ever create 32 worlds (ADR 0001). With the fix, the
 * physics module can throw a world away and start a fresh one, which Reset
 * needs to replay a run exactly.
 *
 * Runs on `npm install` (postinstall). Safe to run again.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(
  new URL('../node_modules/phaser-box2d/dist/PhaserBox2D.js', import.meta.url),
);
const bug = `  world = new b2World();
  world.worldId = B2_NULL_INDEX;
  world.revision = revision + 1;
}`;
const fix = `  world = new b2World();
  world.worldId = B2_NULL_INDEX;
  world.revision = revision + 1;
  b2_worlds[worldId.index1 - 1] = world; // patched by inkforge: free the slot
}`;

const source = readFileSync(file, 'utf8');
if (source.includes(fix)) {
  console.log('phaser-box2d: already patched');
} else if (source.split(bug).length === 2) {
  writeFileSync(file, source.replace(bug, fix));
  console.log('phaser-box2d: patched b2DestroyWorld to free its world slot');
} else {
  throw new Error(
    'phaser-box2d: b2DestroyWorld is not as expected; check scripts/patch-phaser-box2d.mjs against this version',
  );
}
