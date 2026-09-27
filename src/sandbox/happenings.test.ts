import { describe, expect, it } from 'vitest';
import { DEMOLITION_DEMO } from '../gallery/gallery';
import { dragBox } from '../stroke/pointer-paths';
import { Happenings } from './happenings';
import {
  drawLine,
  drawObject,
  entriesOf,
  hear,
  runFor,
  sandboxWorlds,
  wentOf,
} from './test-support';

const createWorld = sandboxWorlds();

describe('The list of what happened', () => {
  it('gives each reader every entry since it last read, stamped with the time', () => {
    let time = 0;
    const list = new Happenings(() => time);
    const first = list.reader();
    list.say({ kind: 'start-over' });
    const second = list.reader();
    time = 1;
    list.say({ kind: 'released', id: 7 });

    expect(first.read()).toEqual([
      { kind: 'start-over', time: 0 },
      { kind: 'released', id: 7, time: 1 },
    ]);
    expect(first.read()).toEqual([]);
    expect(second.read()).toEqual([{ kind: 'released', id: 7, time: 1 }]);
  });

  it('keeps nothing while no reader is open, or for one that closed', () => {
    const list = new Happenings(() => 0);
    list.say({ kind: 'start-over' });
    const reader = list.reader();
    expect(reader.read()).toEqual([]);

    reader.close();
    list.say({ kind: 'start-over' });
    expect(reader.read()).toEqual([]);
  });

  it('says nothing of what happens quietly', () => {
    const list = new Happenings(() => 0);
    const reader = list.reader();

    list.quietly(() => list.say({ kind: 'start-over' }));

    expect(reader.read()).toEqual([]);
  });
});

describe('What the Sandbox world says happened', () => {
  it('says each Piece and Object it adds, and what undo and remove take away', () => {
    const world = createWorld();
    const heard = hear(world);
    const line = drawLine(world, [
      { x: 200, y: 700 },
      { x: 300, y: 700 },
    ]);
    const box = drawObject(world, dragBox(500, 300, 60, 60));

    world.undo();
    world.remove(line);

    const added = entriesOf(heard(), 'added').map(({ what }) => what);
    expect(added).toEqual([
      { thing: 'piece', id: line, index: 0 },
      { thing: 'piece', id: line, index: 1 },
      { thing: 'object', id: box },
    ]);
    expect(wentOf(heard())).toEqual([
      `object ${box} undone`,
      `piece ${line}.0 removed`,
      `piece ${line}.1 removed`,
    ]);
  });

  it('says nothing as physics starts: everything comes back as it was', () => {
    const world = createWorld();
    drawObject(world, dragBox(500, 300, 60, 60));
    const heard = hear(world);

    world.togglePause();

    expect(heard()).toEqual([]);
  });

  it('says only the player’s Release', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(500, 300, 60, 60));
    const heard = hear(world);
    world.togglePause();

    world.releaseAt({ x: 530, y: 330 });
    world.releaseAt({ x: 530, y: 330 }); // no longer Frozen

    expect(heard()).toEqual([{ kind: 'released', id: box, time: 0 }]);
  });

  it('says the Demolition chain: its Blasts, bursts, and why each thing went', () => {
    const world = createWorld();
    DEMOLITION_DEMO.build(world);
    const heard = hear(world);

    runFor(world, 5);

    const entries = heard();
    const exploded = entriesOf(entries, 'exploded');
    expect(exploded.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
    expect(world.blasts).toEqual([]);
    const went = entriesOf(entries, 'went');
    const why = (thing: string) =>
      new Set(went.filter(({ what }) => what.thing === thing).map(({ why }) => why));
    expect(why('object')).toEqual(new Set(['broke']));
    expect(why('droplet')).toEqual(new Set(['landed']));
    // Every Object that broke burst into Debris, and so did every Piece.
    const broke = went.filter(({ why }) => why === 'broke').length;
    expect(entriesOf(entries, 'burst')).toHaveLength(broke);
    // In time order.
    const times = entries.map(({ time }) => time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('starts over on Clear and on R, and R adds everything again', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(500, 300, 60, 60));
    world.togglePause();
    runFor(world, 0.1);
    const heard = hear(world);

    world.reset();
    world.clear();

    expect(heard().map(({ kind }) => kind)).toEqual(['start-over', 'added', 'start-over']);
    expect(entriesOf(heard(), 'added')[0]!.what).toEqual({ thing: 'object', id: box });
    // R goes back to the time of the start.
    expect(heard()[0]!.time).toBe(0);
  });
});
