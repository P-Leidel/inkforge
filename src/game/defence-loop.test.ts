import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import {
  DefenceLoop,
  FIRST_INTERMISSION,
  type LoopPosition,
  type LoopWorld,
  type Refill,
  type SpaceVerb,
} from './defence-loop';
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
  /** Every pause and freeze the loop asked for, in order. */
  readonly calls: string[] = [];
  inkCore = { hp: 10 };

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
  between = false,
}: { on?: boolean; wave?: WaveSetup; waves?: WaveSetup[]; between?: boolean } = {}) {
  const world = new FakeWorld();
  const tanks = new FakeTanks();
  const defence = new DefenceLoop({
    world,
    tanks,
    table: table(wave),
    waves: on,
    buildBetweenWaves: between,
  });
  if (waves) defence.load(waves.map(table));
  // Only what the loop asks for after setting up.
  world.calls.length = 0;
  return { defence, world, tanks };
}

/** The loop's position as Space last started physics: what the Game's checkpoint holds of it. */
const checkpoints = new WeakMap<DefenceLoop, LoopPosition>();

/**
 * Space, carried out on the fake world as the Game does, taking the loop's
 * position on a start. Returns what the loop said.
 */
function space(defence: DefenceLoop, world: FakeWorld): SpaceVerb | null {
  const verb = defence.space();
  if (verb === 'start') checkpoints.set(defence, defence.snapshot());
  if (verb) world.isRunning = verb !== 'pause';
  return verb;
}

/** R, as the Game does it to the loop: back to the position of the last start. */
function retry(defence: DefenceLoop): void {
  defence.restore(checkpoints.get(defence)!);
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

describe('Space', () => {
  it('with Waves off, starts and pauses physics, and starts it again: no phases', () => {
    const { defence, world } = loop();

    expect(space(defence, world)).toBe('start');
    expect(defence.reading.phase).toBeNull();
    expect(defence.bar('draw')).toBeNull();
    expect(space(defence, world)).toBe('pause');
    expect(space(defence, world)).toBe('start');
    expect(world.calls).toEqual([]);
  });

  it('with Waves on, starts a Wave from an Intermission, then pauses and resumes it', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });

    expect(space(defence, world)).toBe('start');
    expect(defence.reading).toMatchObject({ phase: 'wave', toCome: 2 });
    expect(space(defence, world)).toBe('pause');
    expect(space(defence, world)).toBe('resume');
    expect(defence.reading).toMatchObject({ phase: 'wave', wave: 1 });
    expect(world.calls).toEqual([]);
  });

  it('once the Level is cleared, says nothing with Waves on, and starts physics with them off', () => {
    const { defence, world } = loop({ on: true });
    space(defence, world);
    step(defence, world);
    expect(defence.reading.phase).toBe('cleared');

    expect(space(defence, world)).toBeNull();
    defence.waves = false;
    expect(space(defence, world)).toBe('start');
  });

  it('once the Ink Core is destroyed, says nothing, Waves on or off, even within a paused Wave', () => {
    for (const on of [false, true]) {
      const { defence, world } = loop({ on, wave: { crawler: 2 } });
      space(defence, world);
      world.inkCore.hp = 0;
      step(defence, world);
      expect(world.isRunning).toBe(false);

      expect(space(defence, world)).toBeNull();
    }
  });

  it('while physics runs, pauses it, whatever the phase', () => {
    const { defence, world } = loop({ on: true });
    world.isRunning = true;

    expect(defence.reading.phase).toBe('intermission');
    expect(space(defence, world)).toBe('pause');
    expect(defence.reading.phase).toBe('intermission');
  });
});

describe('An Intermission', () => {
  it('reads the next Wave: each Enemy type it sends and how many, the first included', () => {
    const { defence, world } = loop({
      on: true,
      waves: [
        { crawler: 3, gap: 0 },
        { crawler: 2.7, runner: 1, heavy: -1 },
      ],
    });
    expect(defence.reading.next).toEqual({ crawler: 3, runner: 0, heavy: 0 });

    space(defence, world);
    expect(defence.reading.next).toBeNull();
    step(defence, world, 3);
    killAll(defence, world);

    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    expect(defence.reading.next).toEqual({ crawler: 2, runner: 1, heavy: 0 });
  });

  it('reads no next Wave with Waves off, nor once the Level is cleared', () => {
    expect(loop().defence.reading.next).toBeNull();

    const { defence, world } = loop({ on: true, waves: [{}] });
    space(defence, world);
    step(defence, world);
    expect(defence.reading.phase).toBe('cleared');
    expect(defence.reading.next).toBeNull();
  });

  it('comes before the first Wave: nothing can be built, and Space starts the Wave', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    expect(defence.reading).toMatchObject({
      phase: 'intermission',
      wave: 1,
      waves: 1,
      rewards: null,
    });
    expect(defence.bar('draw')).toBe('not-now');

    expect(space(defence, world)).toBe('start');

    expect(defence.reading.phase).toBe('wave');
    expect(defence.bar('draw')).toBeNull();
  });
});

describe('A Wave', () => {
  it('pauses and resumes with Space, and stays the same Wave; building goes on while paused', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);

    expect(space(defence, world)).toBe('pause');
    expect(world.isRunning).toBe(false);
    expect(defence.reading.phase).toBe('wave');
    expect(defence.bar('draw')).toBeNull();
    expect(space(defence, world)).toBe('resume');
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
    expect(world.calls).toEqual(['pause', 'freeze']);
    expect(tanks.fills).toBe(1);
    expect(defence.bar('draw')).toBe('not-now');
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
    expect(defence.bar('draw')).toBe('not-now');
    expect(space(defence, world)).toBeNull();
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
  it('stops physics during a Wave, which is lost where it was: no refill', () => {
    const { defence, world, tanks } = loop({ on: true, waves: [{}, { crawler: 3 }] });
    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(defence.reading).toMatchObject({
      phase: 'lost',
      wave: 2,
      toCome: 2,
      coreDestroyed: true,
    });
    expect(world.isRunning).toBe(false);
    expect(tanks.fills).toBe(1);
  });

  it('stops physics with Waves off too, with no phase', () => {
    const { defence, world } = loop();
    space(defence, world);

    world.inkCore.hp = 0;
    step(defence, world);

    expect(world.isRunning).toBe(false);
    expect(defence.reading).toMatchObject({ phase: null, coreDestroyed: true });
  });

  it('is the phase once Waves are switched on after it', () => {
    const { defence, world } = loop();
    world.inkCore.hp = 0;

    defence.waves = true;

    expect(defence.reading.phase).toBe('lost');
  });

  it('lets Space start or resume nothing until the Ink Core is whole again', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 1 } });
    world.inkCore.hp = 0;

    expect(space(defence, world)).toBeNull();
    expect(defence.reading.phase).toBe('lost');

    world.inkCore.hp = 10;
    expect(space(defence, world)).toBe('start');
    expect(defence.reading.phase).toBe('wave');
  });
});

describe('What the player may do now', () => {
  const ACTIONS = ['draw', 'fill', 'erase', 'undo'] as const;

  it('with Waves off, is anything, near an Enemy or not', () => {
    const { defence } = loop();

    for (const action of ACTIONS) expect(defence.bar(action)).toBeNull();
    expect(defence.bar('draw', { nearEnemy: true })).toBeNull();
  });

  it('with Waves on, is nothing outside a Wave: in an Intermission or once the Level is cleared', () => {
    const { defence, world } = loop({ on: true });
    for (const action of ACTIONS) expect(defence.bar(action)).toBe('not-now');

    space(defence, world);
    step(defence, world);
    expect(defence.reading.phase).toBe('cleared');
    for (const action of ACTIONS) expect(defence.bar(action)).toBe('not-now');
  });

  it('with building between Waves on, as it is by default for now, is anything outside a Wave but drawing near an Enemy', () => {
    const world = new FakeWorld();
    const defence = new DefenceLoop({
      world,
      tanks: new FakeTanks(),
      table: table({}),
      waves: true,
    });
    expect(defence.reading.phase).toBe('intermission');
    for (const action of ACTIONS) expect(defence.bar(action)).toBeNull();
    expect(defence.bar('draw', { nearEnemy: true })).toBe('near-enemy');

    const { defence: cleared, world: clearedWorld } = loop({ on: true, between: true });
    space(cleared, clearedWorld);
    step(cleared, clearedWorld);
    expect(cleared.reading.phase).toBe('cleared');
    for (const action of ACTIONS) expect(cleared.bar(action)).toBeNull();
  });

  it('during a Wave, running or paused, is anything but drawing near an Enemy', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);

    for (const paused of [false, true]) {
      if (paused) space(defence, world);
      expect(world.isRunning).toBe(!paused);
      for (const action of ACTIONS) expect(defence.bar(action)).toBeNull();
      expect(defence.bar('draw', { nearEnemy: true })).toBe('near-enemy');
    }
  });

  it('once the Ink Core is destroyed, is nothing, Waves on or off, until R', () => {
    for (const on of [false, true]) {
      const { defence, world } = loop({ on, wave: { crawler: 2 } });
      space(defence, world);
      world.inkCore.hp = 0;
      step(defence, world);

      for (const action of ACTIONS) expect(defence.bar(action)).toBe('lost');
      expect(defence.bar('draw', { nearEnemy: true })).toBe('lost');

      world.inkCore.hp = 10;
      retry(defence);
      expect(defence.bar('draw')).toBe(on ? 'not-now' : null);
    }
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

describe('The position, for R', () => {
  it('goes back to the Intermission before the Wave under way, which comes whole again', () => {
    const { defence, world } = loop({ on: true, waves: [{}, { crawler: 2 }, {}] });
    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);

    retry(defence);

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

    retry(defence);
    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });

    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);
    expect(defence.reading.phase).toBe('cleared');
    retry(defence);
    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
  });

  it('is taken at every start, Waves on or off', () => {
    const { defence, world } = loop({ on: true, waves: [{}, { crawler: 1 }] });
    space(defence, world);
    step(defence, world);
    defence.waves = false;
    space(defence, world);
    defence.waves = true;

    retry(defence);

    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    expect(defence.reading.rewards?.summary.wave).toBe(1);
  });

  it('keeps the Wave tables as they are: F2 edits survive it', () => {
    const { defence, world } = loop({ on: true, wave: { crawler: 2 } });
    space(defence, world);
    defence.edit((table) => (table.counts.runner = 1));

    retry(defence);
    world.isRunning = false;
    space(defence, world);

    expect(defence.reading.toCome).toBe(3);
  });

  it("is a copy: what ends after it is taken isn't in it", () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}] });
    const position = defence.snapshot();
    space(defence, world);
    step(defence, world);

    defence.restore(position);

    expect(defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });
  });

  it('first, takes the loop back to Wave 1 with nothing ended, as everything starts over', () => {
    const { defence, world } = loop({ on: true, waves: [{}, {}, { crawler: 1 }] });
    space(defence, world);
    step(defence, world);
    space(defence, world);
    step(defence, world);

    defence.restore(FIRST_INTERMISSION);

    expect(defence.reading).toMatchObject({
      phase: 'intermission',
      wave: 1,
      waves: 3,
      rewards: null,
    });
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

  it('pauses physics a build left running with Waves on, and leaves it running with Waves off', () => {
    for (const on of [false, true]) {
      const { defence, world } = loop({ on });
      world.isRunning = true;

      defence.load();

      expect(world.isRunning).toBe(!on);
      expect(world.calls).toEqual(on ? ['pause'] : []);
    }
  });
});
