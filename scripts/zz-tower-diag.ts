import { SandboxWorld } from '../src/sandbox/sandbox-world';
import { BoxTower } from '../src/stress-tests/box-tower';
const world = new SandboxWorld({ seed: 2026 });
new BoxTower(world);
const top0 = world.objects[9]!.transform;
let maxDev = 0;
for (let s = 1; s <= 60 * 20; s++) {
  world.step();
  const t = world.objects[9]!.transform;
  maxDev = Math.max(maxDev, Math.abs(t.x - top0.x));
}
const t = world.objects[9]!.transform;
console.log(
  `${process.env.LABEL}: top box sideways drift max ${maxDev.toFixed(2)} px, final dy ${(t.y - top0.y).toFixed(1)}, verts ${world.objects[0]!.outline.length}, parts ${world.objects[0]!.parts.length}`,
);
world.dispose();
