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
    expect(snapshot.grey).toBe(fromLineLength(3600));
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
