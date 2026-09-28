import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { createInkTable, fromLineLength, inLineLength } from './ink-table';
import { InkTanks } from './ink-tanks';

/** Tanks over a fresh Ink table, which the test may edit. */
function tanks() {
  const table = createInkTable();
  return { table, tanks: new InkTanks(table) };
}

/** What `colour`'s Tank holds, in Line length. */
const units = (tanks: InkTanks, colour: Colour) => inLineLength(tanks.reading()[colour].spendable);

describe('Ink Tanks', () => {
  it('start full, at the Ink table maximums', () => {
    const { tanks: full } = tanks();

    for (const colour of COLOURS) {
      const { spendable, maximum } = full.reading()[colour];
      expect(spendable).toBe(maximum);
    }
    expect(full.reading().grey.maximum).toBe(fromLineLength(4000));
    expect(full.reading().red.maximum).toBe(fromLineLength(1000));
  });

  it('spend from one Tank only, and never go below 0', () => {
    const { tanks: some } = tanks();

    some.spend('grey', fromLineLength(400));
    expect(some.reading().grey.spendable).toBe(fromLineLength(3600));
    expect(some.reading().blue.spendable).toBe(fromLineLength(3000));

    some.spend('red', fromLineLength(1000) + 5);
    expect(some.reading().red.spendable).toBe(0);
  });

  it('refund, but never past the maximum', () => {
    const { tanks: some } = tanks();
    some.spend('grey', fromLineLength(400));

    some.refund('grey', fromLineLength(100));
    expect(some.reading().grey.spendable).toBe(fromLineLength(3700));
    some.refund('grey', fromLineLength(500));
    expect(some.reading().grey.spendable).toBe(fromLineLength(4000));
  });

  it('can pay a price up to what is left, with a rounding leeway, and no more', () => {
    const { tanks: some } = tanks();
    const left = fromLineLength(1000);

    expect(some.canPay('red', left)).toBe(true);
    expect(some.canPay('red', left + 1e-7)).toBe(true);
    expect(some.canPay('red', left + 1e-5)).toBe(false);
    some.spend('red', left);
    expect(some.canPay('red', 0)).toBe(true);
    expect(some.canPay('red', 1e-5)).toBe(false);
  });

  it('empty a Tank down to a lowered maximum at once, and leave it on a raised one', () => {
    const { table, tanks: some } = tanks();
    some.spend('grey', fromLineLength(400)); // grey holds 3600

    table.tanks.grey = 3800; // still above what grey holds
    table.tanks.red = 600;
    some.fitMaximums();
    expect(units(some, 'grey')).toBe(3600);
    expect(units(some, 'red')).toBe(600);

    table.tanks.grey = 3000;
    table.tanks.red = 1000;
    some.fitMaximums();
    expect(units(some, 'grey')).toBe(3000);
    expect(units(some, 'red')).toBe(600);
    expect(some.reading().red.maximum).toBe(fromLineLength(1000));
  });

  it('fill every Tank to its maximum, edited or not', () => {
    const { table, tanks: some } = tanks();
    for (const colour of COLOURS) some.spend(colour, fromLineLength(200));
    table.tanks.blue = 5000;

    some.fill();

    for (const colour of COLOURS) {
      expect(some.reading()[colour].spendable).toBe(fromLineLength(table.tanks[colour]));
    }
  });

  it('go back to a snapshot, which is a copy', () => {
    const { tanks: some } = tanks();
    some.spend('grey', fromLineLength(400));
    const snapshot = some.snapshot();

    some.spend('grey', fromLineLength(300));
    some.spend('blue', fromLineLength(300));
    expect(snapshot.grey).toEqual({ spendable: fromLineLength(3600), locked: 0 });
    some.restore(snapshot);

    expect(units(some, 'grey')).toBe(3600);
    expect(some.reading().blue.spendable).toBe(fromLineLength(3000));
    some.spend('grey', fromLineLength(100)); // the snapshot stays as it was
    some.restore(snapshot);
    expect(units(some, 'grey')).toBe(3600);
  });

  it('restore a snapshot within a maximum lowered since it was taken', () => {
    const { table, tanks: some } = tanks();
    some.spend('grey', fromLineLength(400));
    const snapshot = some.snapshot(); // grey holds 3600
    some.spend('grey', fromLineLength(1000));

    table.tanks.grey = 3100;
    some.fitMaximums();
    some.restore(snapshot);

    expect(units(some, 'grey')).toBe(3100);
  });

  it('read the whole units of what can be spent, taking a hair under a unit as the unit', () => {
    const { tanks: some } = tanks();

    some.spend('grey', fromLineLength(400.5));
    expect(some.reading().grey.units).toBe(3599);
    some.refund('grey', fromLineLength(0.5) - 1e-9); // a hair under 3600
    expect(some.reading().grey.spendable).toBeLessThan(fromLineLength(3600));
    expect(some.reading().grey.units).toBe(3600);
    some.spend('grey', fromLineLength(0.001)); // well under it
    expect(some.reading().grey.units).toBe(3599);
    expect(some.reading().red.units).toBe(1000);
  });
});

describe('Ink Tanks: Locked Ink and Wave Ink', () => {
  /** What `colour`'s Tank holds, spendable and Locked, in Line length. */
  const parts = (tanks: InkTanks, colour: Colour) => {
    const { spendable, locked } = tanks.reading()[colour];
    return { spendable: inLineLength(spendable), locked: inLineLength(locked) };
  };

  it('lock everything each Tank holds as a Wave starts, so none of it can be spent', () => {
    const { tanks: some } = tanks();
    some.spend('grey', fromLineLength(1000));

    some.lock();

    expect(parts(some, 'grey')).toEqual({ spendable: 0, locked: 3000 });
    expect(some.reading().grey.units).toBe(0);
    expect(some.canPay('grey', fromLineLength(1))).toBe(false);
    expect(some.canPay('grey', 0)).toBe(true);
  });

  it('pick up a Drop as spendable Ink, losing what does not fit beside the Locked Ink', () => {
    const { tanks: some } = tanks();
    some.spend('grey', fromLineLength(100)); // 3900 of 4000
    some.lock();

    some.pickUp('grey', fromLineLength(60));
    expect(parts(some, 'grey')).toEqual({ spendable: 60, locked: 3900 });
    some.pickUp('grey', fromLineLength(60)); // only 40 fit
    expect(parts(some, 'grey')).toEqual({ spendable: 100, locked: 3900 });
    expect(some.canPay('grey', fromLineLength(100))).toBe(true);
    some.spend('grey', fromLineLength(30));
    expect(parts(some, 'grey')).toEqual({ spendable: 70, locked: 3900 });
  });

  it('refund to the part asked for, never past the maximum in all', () => {
    const { tanks: some } = tanks();
    some.spend('red', fromLineLength(400)); // 600
    some.lock();
    some.pickUp('red', fromLineLength(50));
    some.spend('red', fromLineLength(50));

    some.refund('red', fromLineLength(50), 'spendable');
    some.refund('red', fromLineLength(100), 'locked');
    expect(parts(some, 'red')).toEqual({ spendable: 50, locked: 700 });
    some.refund('red', fromLineLength(500), 'locked'); // only 250 fit
    expect(parts(some, 'red')).toEqual({ spendable: 50, locked: 950 });
  });

  it('unlock as the Wave ends: the Locked Ink is spendable again, and the Wave Ink stays', () => {
    const { tanks: some } = tanks();
    some.spend('blue', fromLineLength(1000));
    some.lock();
    some.pickUp('blue', fromLineLength(40));

    some.unlock();

    expect(parts(some, 'blue')).toEqual({ spendable: 2040, locked: 0 });
    expect(some.canPay('blue', fromLineLength(2040))).toBe(true);
  });

  it('go back to a snapshot with its Locked and Wave Ink', () => {
    const { tanks: some } = tanks();
    some.spend('grey', fromLineLength(1000));
    some.lock();
    some.pickUp('grey', fromLineLength(80));
    const snapshot = some.snapshot();

    some.unlock();
    some.spend('grey', fromLineLength(500));
    some.restore(snapshot);

    expect(parts(some, 'grey')).toEqual({ spendable: 80, locked: 3000 });
  });

  it('empty Locked Ink first down to a lowered maximum', () => {
    const { table, tanks: some } = tanks();
    some.spend('red', fromLineLength(500));
    some.lock();
    some.pickUp('red', fromLineLength(100)); // 100 spendable, 500 Locked

    table.tanks.red = 300;
    some.fitMaximums();

    expect(parts(some, 'red')).toEqual({ spendable: 100, locked: 200 });
  });
});
