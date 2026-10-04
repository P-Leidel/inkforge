import { describe, expect, it } from 'vitest';
import type { Colour } from '../materials/colour';
import type { Entry, StrokeId, Thing, Why } from '../sandbox/sandbox-world';
import { InkLedger, type Undoable } from './ink-ledger';
import { createInkTable } from './ink-table';
import { InkTanks } from './ink-tanks';

/*
 * The Ink ledger through its own interface: hand-made entries for what the
 * Sandbox world says happened, and a stand-in for what undo takes back from.
 * No engine.
 */

const id = (n: number) => n as StrokeId;

/** A ledger over full Tanks of the default Ink table. */
function ledger() {
  const tanks = new InkTanks(createInkTable());
  return { tanks, ledger: new InkLedger(tanks) };
}

/** What `colour`'s Tank holds, px². */
const holds = (tanks: InkTanks, colour: Colour) => tanks.reading()[colour].spendable;

/** What `colour`'s Tank has spent, px². */
const spent = (tanks: InkTanks, colour: Colour) =>
  tanks.reading()[colour].maximum - holds(tanks, colour);

const added = (what: Thing): Entry => ({ kind: 'added', what, time: 0 });
const went = (what: Thing, why: Why): Entry => ({
  kind: 'went',
  what,
  why,
  transform: { x: 0, y: 0, angle: 0 },
  velocity: { x: 0, y: 0 },
  time: 0,
});
const piece = (n: number, index: number): Thing => ({ thing: 'piece', id: n, index });
const object = (n: number): Thing => ({ thing: 'object', id: n });

/** A world where the given Strokes and Fills are still there, which undo removes. */
function worldWith(strokes: number[], fills: number[] = []) {
  const standing = new Set(strokes);
  const filled = new Set(fills);
  const world: Undoable = {
    removeStroke: (n) => {
      filled.delete(n);
      return { kind: standing.delete(n) ? 'line' : 'gone' };
    },
    removeFill: (n) => ({ kind: filled.delete(n) ? 'fill' : 'gone' }),
  };
  return world;
}

describe('Ink ledger: charging', () => {
  it('spends each purchase from its own Tank and adds it to the undo history', () => {
    const { tanks, ledger: book } = ledger();

    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [100, 50] });
    book.charge({ kind: 'object', id: id(2), colour: 'blue', price: 300 });
    book.charge({ kind: 'fill', id: id(2), colour: 'black', price: 80 });

    expect(spent(tanks, 'grey')).toBe(150);
    expect(spent(tanks, 'blue')).toBe(300);
    expect(spent(tanks, 'black')).toBe(80);
    expect(book.history).toEqual([
      { kind: 'stroke', id: 1 },
      { kind: 'stroke', id: 2 },
      { kind: 'fill', id: 2 },
    ]);
    expect(book.paid('grey')).toBe(150);
    expect(book.paid('black')).toBe(80);
  });
});

describe('Ink ledger: undo', () => {
  it('takes back newest first, refunding exactly what each paid', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'object', id: id(1), colour: 'grey', price: 300 });
    book.charge({ kind: 'fill', id: id(1), colour: 'black', price: 80 });
    const world = worldWith([1], [1]);

    expect(book.undo(world)).toEqual({ kind: 'fill', id: 1 });
    expect(spent(tanks, 'black')).toBe(0);
    expect(spent(tanks, 'grey')).toBe(300);

    expect(book.undo(world)).toEqual({ kind: 'stroke', id: 1 });
    expect(spent(tanks, 'grey')).toBe(0);
    expect(book.undo(world)).toBeNull();
  });

  it('refunds an Object with its Fill when the Object is undone first', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'fill', id: id(1), colour: 'black', price: 80 });
    book.charge({ kind: 'object', id: id(1), colour: 'grey', price: 300 });

    book.undo(worldWith([1], [1]));

    expect(spent(tanks, 'grey')).toBe(0);
    expect(spent(tanks, 'black')).toBe(0);
    expect(book.history).toEqual([]);
  });

  it('skips what is gone already, refunding nothing for it, and takes back the next', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'object', id: id(1), colour: 'grey', price: 100 });
    book.charge({ kind: 'object', id: id(2), colour: 'grey', price: 200 });

    expect(book.undo(worldWith([1]))).toEqual({ kind: 'stroke', id: 1 });

    expect(spent(tanks, 'grey')).toBe(200);
    expect(book.history).toEqual([]);
  });

  it("refunds only a Line's standing Pieces", () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [100, 50, 25] });
    book.hear(went(piece(1, 1), 'broke'));

    book.undo(worldWith([1]));

    expect(spent(tanks, 'grey')).toBe(50);
  });
});

describe('Ink ledger: hearing the world', () => {
  it('refunds what is erased, and nothing for what breaks or is removed', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [100, 50] });
    book.charge({ kind: 'object', id: id(2), colour: 'blue', price: 300 });
    book.charge({ kind: 'fill', id: id(2), colour: 'black', price: 80 });
    book.charge({ kind: 'object', id: id(3), colour: 'blue', price: 40 });

    book.hear(went(piece(1, 0), 'erased'));
    book.hear(went(piece(1, 1), 'broke'));
    book.hear(went(object(2), 'erased'));
    book.hear(went(object(3), 'removed'));

    expect(spent(tanks, 'grey')).toBe(50);
    expect(spent(tanks, 'blue')).toBe(40);
    expect(spent(tanks, 'black')).toBe(0);
    expect(book.history).toEqual([]);
  });

  it('keeps a Line in the history until its last Piece goes', () => {
    const { ledger: book } = ledger();
    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [10, 10] });

    book.hear(went(piece(1, 0), 'broke'));
    expect(book.history).toEqual([{ kind: 'stroke', id: 1 }]);
    book.hear(went(piece(1, 1), 'broke'));
    expect(book.history).toEqual([]);
  });

  it('ignores what undo took back, which it already knows', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'object', id: id(1), colour: 'grey', price: 100 });
    book.undo(worldWith([1]));

    book.hear(went(object(1), 'undone'));

    expect(spent(tanks, 'grey')).toBe(0);
  });

  it('adds what is made below the Game at price 0, so undo takes it back and refunds nothing', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'object', id: id(5), colour: 'grey', price: 100 });
    book.hear(added(object(1)));
    book.hear(added(piece(2, 0)));
    book.hear(added(piece(2, 1)));
    book.hear({ kind: 'filled', id: 1, fill: 'black', time: 0 });

    expect(book.history).toEqual([
      { kind: 'stroke', id: 5 },
      { kind: 'stroke', id: 1 },
      { kind: 'stroke', id: 2 },
      { kind: 'fill', id: 1 },
    ]);
    const world = worldWith([1, 2, 5], [1]);
    book.undo(world);
    book.undo(world);
    book.undo(world);
    expect(spent(tanks, 'grey')).toBe(100);
  });

  it('hears nothing new in the Pieces of a Line it charged, made again as it changes form', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [100, 50] });

    book.hear(added(piece(1, 0)));

    expect(book.history).toEqual([{ kind: 'stroke', id: 1 }]);
    book.undo(worldWith([1]));
    expect(spent(tanks, 'grey')).toBe(0);
  });

  it('forgets everything when the world starts over, and leaves the Tanks to the Game', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'object', id: id(1), colour: 'grey', price: 100 });

    book.hear({ kind: 'start-over', time: 0 });

    expect(book.history).toEqual([]);
    expect(book.paid('grey')).toBe(0);
    expect(spent(tanks, 'grey')).toBe(100);
  });
});

describe('Ink ledger: snapshots', () => {
  it('restores what was paid and the history, and a restored Line keeps its own Pieces', () => {
    const { tanks, ledger: book } = ledger();
    book.charge({ kind: 'line', id: id(1), colour: 'grey', pieces: [100, 50] });
    const snapshot = book.snapshot();

    book.hear(went(piece(1, 0), 'broke'));
    book.restore(snapshot);
    book.hear(went(piece(1, 1), 'broke'));
    book.restore(snapshot);

    expect(book.paid('grey')).toBe(150);
    book.undo(worldWith([1]));
    expect(spent(tanks, 'grey')).toBe(0);
  });
});
