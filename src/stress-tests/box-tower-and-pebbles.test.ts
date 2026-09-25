import { afterEach, describe, expect, it } from 'vitest';
import { SandboxWorld } from '../sandbox/sandbox-world';
import { BoxTower } from './box-tower';
import { PebbleDrop } from './pebble-drop';

const worlds: SandboxWorld[] = [];
function createWorld(): SandboxWorld {
  const world = new SandboxWorld({ seed: 7 });
  worlds.push(world);
  return world;
}
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

// Settling, jitter, standing for 60 s and frame rate are judged in the
// browser and by `npm run verdict`, not here (milestone 1 spec).
describe('Stress tests: set-up', () => {
  it('the box tower draws 10 boxes through the Stroke pipeline and lets them go', () => {
    const world = createWorld();

    new BoxTower(world);

    expect(world.objects).toHaveLength(10);
    expect(world.objects.every((o) => !o.frozen)).toBe(true);
  });

  it('the pebble drop draws 100 small Objects through the Stroke pipeline and lets them go', () => {
    const world = createWorld();

    const pebbles = new PebbleDrop(world);

    expect(pebbles.refused).toBe(0);
    expect(world.objects).toHaveLength(100);
    expect(world.objects.every((o) => !o.frozen)).toBe(true);
  });
});
