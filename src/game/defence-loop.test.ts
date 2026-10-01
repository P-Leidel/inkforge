import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { DefenceLoop, type LoopWorld, type Refill } from './defence-loop';
import { createWaveTable, type ReadonlyWaveTable } from './wave-table';

/**
 * A stand-in for the Sandbox world: Enemies are a count, the lane is clear
 * unless told otherwise, and the Ink Core has 10 HP.
 */
class FakeWorld implements LoopWorld {
  isRunning = false;
  enemyCount = 0;
  laneClear = true;
  readonly spawned: EnemyType[] = [];
  /** Every start, pause, resume and freeze, in order. */
  readonly calls: string[] = [];
  inkCore = { hp: 10 };

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

  freezeResting(): void {
    this.calls.push('freeze');
  }
}

/** Ink Tanks that only say when they were filled. */
class FakeTanks implements Refill {
  fills = 0;
  fill(): void {
    this.fills++;
  }
}

type WaveSetup = Partial<ReadonlyWaveTable['counts']> & { gap?: number };

/** A Wave table of `counts` and `gap`, every other count 0. */
function table({ gap, ...counts }: WaveSetup = {}) {
  const wave = createWaveTable();
  wave.counts = { crawler: 0, runner: 0, heavy: 0, ...counts };
  if (gap !== undefined) wave.gap = gap;
  return wave;
}

/** A Defence loop over a fake world and fake Tanks, with one Wave, or `waves` loaded as a Level's. */
function loop({
  on = false,
  wave = {},
  waves,
}: { on?: boolean; wave?: WaveSetup; waves?: WaveSetup[] } = {}) {
  const world = new FakeWorld();
  const tanks = new FakeTanks();
  const defence = new DefenceLoop({ world, tanks, table: table(wave), waves: on });
  if (waves) defence.load(waves.map(table));
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

/** Kills every Enemy in the fake world and steps once: the Wave ends if none is to come. */
function killAll(defence: DefenceLoop, world: FakeWorld): void {
  world.enemyCount = 0;
  step(defence, world);
}

/** As much Ink of each Colour as `grey` says of grey, and none of the others. */
const ink = (grey: number) =>
  Object.fromEntries(COLOURS.map((colour) => [colour, colour === 'grey' ? grey : 0])) as Record<
    Colour,
    number
  >;

describe('Space, with Waves off', () => {
  it('starts physics, taking the snapshot just before, and pauses it', () => {
    const { defence, world } = loop();

    space(defence, world);
    expect(world.calls).toEqual(['snapshot', 'start']);
    expect(defence.reading.phase).toBeNull();
    expect(defence.building).toBe(true);

    space(defence, world);
    expect(world.calls).toEqual(['snapshot', 'start', 'pause']);
  });
});

describe('An Intermission', () => {
  it('comes before the first Wave: nothing can be built, and Space starts the Wave', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    expect(defence.reading).toMatchObject({
      phase: 'intermission',
      wave: 1,
      waves: 1,
      rewards: null,
    });
    expect(defence.building).toBe(false);

    space(defence, world);

    expect(defence.reading.phase).toBe('wave');
    expect(defence.building).toBe(true);
    expect(world.calls).toEqual(['snapshot', 'start']);
  });
});

describe('A Wave', () => {
  it('pauses and resumes with Space, and stays the same Wave; building goes on while paused', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);

    space(defence, world);
    expect(world.isRunning).toBe(false);
    expect(defence.reading.phase).toBe('wave');
    expect(defence.building).toBe(true);
    space(defence, world);

    expect(world.calls).toEqual(['snapshot', 'start', 'pause', 'resume']);
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
  it('comes when none is left to come and none is alive: physics stops, the Tanks refill, resting Objects freeze', () => {
    const { defence, world, tanks } = loop({ on: true, waves: [{ crawler: 1 }, { runner: 1 }] });
    space(defence, world);
    step(defence, world, 3);
    expect(defence.reading.phase).toBe('wave');
    expect(tanks.fills).toBe(0);

    killAll(defence, world);

    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2, waves: 2 });
    expect(world.isRunning).toBe(false);
    expect(world.calls).toEqual(['snapshot', 'start', 'pause', 'freeze']);
    expect(tanks.fills).toBe(1);
    expect(defence.building).toBe(false);
  });

  it("gives the rewards: the Wave's summary of kills, Ink Core HP and Ink picked up", () => {
    const { defence, world } = loop({ on: true, waves: [{ crawler: 2 }, { runner: 1 }] });
    space(defence, world);
    step(defence, world, 200);
    defence.killed(ink(40));
    defence.killed(ink(25));
    world.inkCore.hp = 7;

    killAll(defence, world);

    expect(defence.reading.rewards).toEqual({
      summary: { wave: 1, kills: 2, coreHp: 7, ink: ink(65) },
    });
  });

  it('counts no kill outside a Wave', () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}] });
    defence.killed(ink(40));
    space(defence, world);
    step(defence, world);

    expect(defence.reading.rewards?.summary).toMatchObject({ kills: 0, ink: ink(0) });
  });

  it('comes after the first step for an empty list', () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}] });
    space(defence, world);
    step(defence, world);

    expect(defence.reading.phase).toBe('intermission');
    expect(world.isRunning).toBe(false);
  });

  it('after the last Wave, clears the Level: Space starts nothing more', () => {
    const { defence, world, tanks } = loop({ on: true, waves: [{}, {}, {}] });
    for (let wave = 1; wave <= 3; wave++) {
      expect(defence.reading).toMatchObject({ phase: 'intermission', wave });
      space(defence, world);
      step(defence, world);
    }

    expect(defence.reading).toMatchObject({ phase: 'cleared', wave: 3, waves: 3 });
    expect(defence.reading.rewards?.summary.wave).toBe(3);
    expect(tanks.fills).toBe(3);
    expect(defence.building).toBe(false);
    world.calls.length = 0;
    space(defence, world);
    expect(world.calls).toEqual([]);
  });
});

describe("The Level's Waves", () => {
  it('each send in their own list, and F2 edits the current one', () => {
    const { defence, world } = loop({ on: true, waves: [{ crawler: 1 }, { heavy: 2 }] });
    expect(defence.table.counts).toEqual({ crawler: 1, runner: 0, heavy: 0 });
    space(defence, world);
    step(defence, world);
    killAll(defence, world);

    defence.edit((table) => (table.counts.runner = 1));
    expect(defence.list[0]!.counts.runner).toBe(0);
    space(defence, world);
    step(defence, world, 400);

    expect(world.spawned).toEqual(['crawler', 'runner', 'heavy', 'heavy']);
  });

  it('without a list of their own, are one Wave: the current table as it is', () => {
    const { defence } = loop({ on: true, waves: [{ crawler: 1 }, {}] });
    const current = defence.table;

    defence.load();

    expect(defence.list).toEqual([table({ crawler: 1 })]);
    expect(defence.table).not.toBe(current);
  });
});

describe('The Ink Core destroyed', () => {
  it('stops physics during a Wave, which stays where it was lost: no refill', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 3 } });
    space(defence, world);
    step(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(defence.reading.coreDestroyed).toBe(true);
    expect(defence.reading.phase).toBe('wave');
    expect(world.isRunning).toBe(false);
    expect(tanks.fills).toBe(0);
  });

  it('stops physics with Waves off too', () => {
    const { defence, world } = loop();
    space(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(world.isRunning).toBe(false);
    expect(defence.reading.coreDestroyed).toBe(true);
  });

  it('lets Space start or resume nothing until the Ink Core is whole again', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 1 } });
    world.inkCore.hp = 0;

    space(defence, world);
    expect(world.calls).toEqual([]);
    expect(defence.reading.phase).toBe('intermission');

    world.inkCore.hp = 10;
    space(defence, world);
    expect(defence.reading.phase).toBe('wave');
  });
});

describe('The Waves switch', () => {
  it("turned on, puts the loop in the Intermission before the Wave it's at, pausing physics", () => {
    const { defence, world } = loop();
    space(defence, world);

    defence.waves = true;

    expect(defence.waves).toBe(true);
    expect(defence.reading.phase).toBe('intermission');
    expect(world.isRunning).toBe(false);
  });

  it('turned off during a Wave, ends it where it is: physics runs on, no more arrivals, no refill', () => {
    const { defence, world, tanks } = loop({ on: true, wave: { crawler: 3 } });
    space(defence, world);
    step(defence, world);

    defence.waves = false;
    step(defence, world, 200);

    expect(defence.reading.phase).toBeNull();
    expect(world.isRunning).toBe(true);
    expect(world.spawned).toEqual(['crawler']);
    expect(tanks.fills).toBe(0);
  });
});

describe('Reset, for R', () => {
  it('goes back to the Intermission before the Wave under way, which comes whole again', () => {
    const { defence, world } = loop({ on: true, waves: [{}, { crawler: 2 }, {}] });
    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);

    defence.reset();

    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2, toCome: 0 });
    expect(defence.reading.rewards?.summary.wave).toBe(1);
    world.isRunning = false;
    space(defence, world);
    expect(defence.reading.toCome).toBe(2);
  });

  it('in an Intermission or once cleared, retries the Wave just played', () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}] });
    space(defence, world);
    step(defence, world);
    expect(defence.reading.wave).toBe(2);

    defence.reset();
    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });

    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);
    expect(defence.reading.phase).toBe('cleared');
    defence.reset();
    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
  });
});

describe('Loading a Level, for Clear', () => {
  it('goes back to Wave 1, with nothing ended', () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}, {}] });
    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);

    defence.load(defence.list);

    expect(defence.reading).toMatchObject({
      phase: 'intermission',
      wave: 1,
      waves: 3,
      rewards: null,
    });
  });
});
