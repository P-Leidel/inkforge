import { afterEach, describe, expect, it } from 'vitest';
import { SandboxWorld } from '../sandbox/sandbox-world';
import { BallCannon } from './ball-cannon';

const worlds: SandboxWorld[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('Engine verdict check 1: tunnelling', () => {
  it('never lets a 3000 px/s ball through a 4 px Line in 1000 seeded shots', () => {
    const world = new SandboxWorld({ seed: 2026 });
    worlds.push(world);
    const cannon = new BallCannon(world);

    for (let shot = 0; shot < 1000; shot++) {
      cannon.fire();
      for (let step = 0; step < BallCannon.STEPS_PER_SHOT; step++) {
        world.step();
        cannon.track();
      }
    }

    expect(cannon.fired).toBe(1000);
    // Every ball really reached the Line, so the zero below means something.
    expect(cannon.reachedLine).toBe(1000);
    expect(cannon.tunnelled).toBe(0);
  });

  it('draws its 4 px Line and its balls through the Stroke pipeline', () => {
    const world = new SandboxWorld({ seed: 1 });
    worlds.push(world);
    const cannon = new BallCannon(world);

    cannon.fire();

    expect(world.lines).toHaveLength(1);
    expect(world.lines[0]!.thickness).toBe(4);
    expect(world.objects).toHaveLength(1);
    expect(world.objects[0]!.frozen).toBe(false);
    expect(Math.hypot(world.objects[0]!.velocity.x, world.objects[0]!.velocity.y)).toBeCloseTo(
      3000,
      0,
    );
  });
});
