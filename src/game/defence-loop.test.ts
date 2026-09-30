import { describe, expect, it } from 'vitest';
import type { EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { DefenceLoop, type LoopWorld, type WaveLock } from './defence-loop';
import { createWaveTable, type ReadonlyWaveTable } from './wave-table';

/**
 * A stand-in for the Sandbox world: Enemies are a count, the lane is clear
 * unless told otherwise, and the Ink Core is a 100 px block with 10 HP whose
 * centre is at (1000, 500).
 */
class FakeWorld implements LoopWorld {
  isRunning = false;
  enemyCount = 0;
  laneClear = true;
  readonly spawned: EnemyType[] = [];
  /** Every start, pause and resume, in order. */
  readonly calls: string[] = [];
  inkCore = { hp: 10, bounds: { minX: 950, minY: 450, maxX: 1050, maxY: 550 } };

  togglePause(): void {
    this.isRunning = !this.isRunning;
    this.calls.push(this.isRunning ? 'start' : 'pause');
  }

  resume(): void {
    this.isRunning = true;
    this.calls.push('resume');
  }

  pause(): void {
    this.isRunning = false;
    this.calls.push('pause');
  }

  spawnClear(): boolean {
    return this.laneClear;
  }

  spawn(type: EnemyType): void {
    this.spawned.push(type);
    this.enemyCount++;
  }
}

/** Ink Tanks that only say when they were locked and unlocked. */
class FakeTanks implements WaveLock {
  readonly calls: string[] = [];
  lock(): void {
    this.calls.push('lock');
  }
  unlock(): void {
    this.calls.push('unlock');
  }
}

interface Setup {
  readonly on?: boolean;
  readonly wave?: Partial<ReadonlyWaveTable['counts']> & { gap?: number; coreZone?: number };
}

/** A Defence loop over a fake world and fake Tanks. */
function loop({ on = false, wave = {} }: Setup = {}) {
  const world = new FakeWorld();
  const tanks = new FakeTanks();
  const { gap, coreZone, ...counts } = wave;
  const table = createWaveTable();
  table.counts = { crawler: 0, runner: 0, heavy: 0, ...counts };
  if (gap !== undefined) table.gap = gap;
  if (coreZone !== undefined) table.coreZone = coreZone;
  const defence = new DefenceLoop({ world, tanks, table, waves: on });
  return { defence, world, tanks };
}

/** Space, with a start hook that notes when it ran. */
function space(defence: DefenceLoop, world: FakeWorld): void {
  defence.space(() => world.calls.push('snapshot'));
}

/** Runs the loop's hooks around `steps` steps of the fake world, while it runs. */
function step(defence: DefenceLoop, world: FakeWorld, steps = 1): void {
  for (let k = 0; k < steps && world.isRunning; k++) {
    defence.hooks.before?.();
    defence.hooks.after?.();
  }
}

describe('Space, with Waves off', () => {
  it('starts physics, taking the snapshot just before, and pauses it', () => {
    const { defence, world } = loop();

    space(defence, world);
    expect(world.calls).toEqual(['snapshot', 'start']);
    expect(defence.reading.phase).toBeNull();

    space(defence, world);
    expect(world.calls).toEqual(['snapshot', 'start', 'pause']);
  });
});

describe('A Wave', () => {
  it('starts with Space in the Build Phase: the snapshot, then physics, then the Tanks lock', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 2 } });
    expect(defence.reading.phase).toBe('build');

    space(defence, world);

    expect(defence.reading.phase).toBe('wave');
    expect(world.calls).toEqual(['snapshot', 'start']);
    expect(tanks.calls).toEqual(['lock']);
    expect(defence.wave).toBe(1);
  });

  it('pauses and resumes with Space, and stays the same Wave', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);

    space(defence, world);
    expect(world.isRunning).toBe(false);
    expect(defence.reading.phase).toBe('wave');
    space(defence, world);

    expect(world.calls).toEqual(['snapshot', 'start', 'pause', 'resume']);
    expect(tanks.calls).toEqual(['lock']);
    expect(defence.wave).toBe(1);
  });
});

describe('Arrivals', () => {
  it('send the first Enemy in at once, then the rest by the list and its gap', () => {
    const gap = 10 * STEP_SECONDS;
    const { defence, world } = loop({ on: true, wave: { crawler: 1, runner: 1, gap } });
    space(defence, world);

    step(defence, world);
    expect(world.spawned).toEqual(['crawler']);
    expect(defence.reading.toCome).toBe(1);

    step(defence, world, 9);
    expect(world.spawned).toEqual(['crawler']);
    step(defence, world);
    expect(world.spawned).toEqual(['crawler', 'runner']);
    expect(defence.reading.toCome).toBe(0);
  });

  it("wait while the lane's far end is occupied", () => {
    const { defence, world } = loop({ on: true, wave: { heavy: 1 } });
    world.laneClear = false;
    space(defence, world);

    step(defence, world, 5);
    expect(world.spawned).toEqual([]);

    world.laneClear = true;
    step(defence, world);
    expect(world.spawned).toEqual(['heavy']);
  });

  it('send nothing with Waves off', () => {
    const { defence, world } = loop({ wave: { crawler: 3 } });
    space(defence, world);
    step(defence, world, 5);

    expect(world.spawned).toEqual([]);
    expect(defence.reading.toCome).toBe(0);
  });
});

describe('The end of a Wave', () => {
  it('comes when none is left to come and none is alive: physics stops, the Tanks unlock', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 1 } });
    space(defence, world);
    step(defence, world, 3);
    expect(defence.reading.phase).toBe('wave');

    world.enemyCount = 0;
    step(defence, world);

    expect(defence.reading.phase).toBe('build');
    expect(world.isRunning).toBe(false);
    expect(tanks.calls).toEqual(['lock', 'unlock']);
    expect(defence.wave).toBeNull();
  });

  it('comes after the first step for an empty list', () => {
    const { defence, world } = loop({ on: true });
    space(defence, world);
    step(defence, world);

    expect(defence.reading.phase).toBe('build');
    expect(world.isRunning).toBe(false);
  });

  it('counts every Wave started', () => {
    const { defence, world } = loop({ on: true });
    space(defence, world);
    step(defence, world);
    space(defence, world);

    expect(defence.wave).toBe(2);
  });
});

describe('The Ink Core destroyed', () => {
  it('ends the Wave with Enemies still to come, and stops physics', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 3 } });
    space(defence, world);
    step(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(defence.reading.coreDestroyed).toBe(true);
    expect(defence.reading.phase).toBe('build');
    expect(defence.reading.toCome).toBe(0);
    expect(world.isRunning).toBe(false);
    expect(tanks.calls).toEqual(['lock', 'unlock']);
  });

  it('stops physics with Waves off too', () => {
    const { defence, world } = loop();
    space(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(world.isRunning).toBe(false);
    expect(defence.reading.coreDestroyed).toBe(true);
  });

  it('lets Space start nothing until the Ink Core is whole again', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 1 } });
    world.inkCore.hp = 0;

    space(defence, world);
    expect(world.calls).toEqual([]);
    expect(defence.reading.phase).toBe('build');

    world.inkCore.hp = 10;
    space(defence, world);
    expect(defence.reading.phase).toBe('wave');
  });
});

describe('The Waves switch', () => {
  it('turned on, puts the loop in the Build Phase, pausing physics', () => {
    const { defence, world } = loop();
    space(defence, world);

    defence.waves = true;

    expect(defence.waves).toBe(true);
    expect(defence.reading.phase).toBe('build');
    expect(world.isRunning).toBe(false);
  });

  it('turned off during a Wave, ends it where it is: physics runs on, no more arrivals', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 3 } });
    space(defence, world);
    step(defence, world);

    defence.waves = false;
    step(defence, world, 200);

    expect(defence.reading.phase).toBeNull();
    expect(world.isRunning).toBe(true);
    expect(world.spawned).toEqual(['crawler']);
    expect(tanks.calls).toEqual(['lock', 'unlock']);
  });
});

describe('The Core Zone', () => {
  it('is a circle centred on the Ink Core, as wide as the Wave table says', () => {
    const { defence } = loop({ wave: { coreZone: 300 } });
    expect(defence.reading.coreZone).toEqual({ centre: { x: 1000, y: 500 }, radius: 150 });

    defence.edit((table) => (table.coreZone = 100));

    expect(defence.reading.coreZone.radius).toBe(50);
  });

  it('holds everything drawn to it only during a Wave, paused or running', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 1, coreZone: 300 } });
    const far = [
      { x: 1000, y: 500 },
      { x: 800, y: 500 },
    ];
    const edge = [
      { x: 1000, y: 500 },
      { x: 850, y: 500 },
    ];
    expect(defence.allows(far)).toBe(true);

    space(defence, world);
    expect(defence.allows(far)).toBe(false);
    expect(defence.allows(edge)).toBe(true);
    space(defence, world);
    expect(defence.allows(far)).toBe(false);
  });

  it('says whether points lie inside it, whatever the phase', () => {
    const { defence } = loop({ wave: { coreZone: 300 } });

    expect(defence.inside([{ x: 1100, y: 500 }])).toBe(true);
    expect(
      defence.inside([
        { x: 1100, y: 500 },
        { x: 1200, y: 500 },
      ]),
    ).toBe(false);
  });
});

describe('Reset, for R and Clear', () => {
  it('goes back to the Build Phase, leaves the Tanks to the Game, and keeps the count of Waves', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);
    step(defence, world);

    defence.reset();

    expect(defence.reading.phase).toBe('build');
    expect(defence.reading.toCome).toBe(0);
    expect(defence.wave).toBeNull();
    expect(tanks.calls).toEqual(['lock']);
    world.isRunning = false;
    space(defence, world);
    expect(defence.wave).toBe(2);
    expect(defence.reading.toCome).toBe(2);
  });
});
