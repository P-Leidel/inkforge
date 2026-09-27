import { describe, expect, it } from 'vitest';
import { createInkTable, fromLineLength } from '../game/ink-table';
import { InkTanks } from '../game/ink-tanks';
import { gaugeViews } from './palette-bar';

/** What the gauges read, over fresh Tanks: grey holds 4000 at most, red 1000. */
function gauges(inkCosts = true) {
  const tanks = new InkTanks(createInkTable());
  return {
    tanks,
    read: {
      inkCosts,
      get tanks() {
        return tanks.reading();
      },
    },
  };
}

describe("The palette's gauges", () => {
  it('fill as the Tank is, to the nearest half pixel, with the whole units left under them', () => {
    const { tanks, read } = gauges();
    tanks.spend('grey', fromLineLength(1000));

    const grey = gaugeViews(read, null)[0]!;

    expect(grey).toEqual({ filled: 0.75, pending: 0, over: false, amount: '3000' });
  });

  it("don't change for less than half a pixel, so they aren't baked again", () => {
    const { tanks, read } = gauges();
    const before = gaugeViews(read, null);

    tanks.spend('grey', fromLineLength(1)); // 4000 of 4000 at 84 px: 1 is a fiftieth of a pixel
    expect(gaugeViews(read, null)[0]!.filled).toBe(before[0]!.filled);
    expect(gaugeViews(read, null)[0]!.amount).toBe('3999');

    tanks.spend('grey', fromLineLength(30)); // over half a pixel
    expect(gaugeViews(read, null)[0]!.filled).toBeLessThan(before[0]!.filled);
  });

  it('show a pending cost on its own Colour only, never more than is left, and all red when over', () => {
    const { tanks, read } = gauges();
    tanks.spend('red', fromLineLength(800)); // 200 of 1000 left

    const affordable = gaugeViews(read, { colour: 'red', price: fromLineLength(100), over: false });
    const over = gaugeViews(read, { colour: 'red', price: fromLineLength(500), over: true });

    // The gauges are 84 px wide: 168 half pixels. A fifth of them is 33.6, shown as 34.
    expect(affordable[4]).toMatchObject({ filled: 34 / 168, pending: 17 / 168, over: false });
    expect(affordable[0]!.pending).toBe(0);
    expect(over[4]).toMatchObject({ filled: 34 / 168, pending: 34 / 168, over: true });
  });

  it('read ∞, full, while Ink costs nothing', () => {
    const { tanks, read } = gauges(false);
    tanks.spend('grey', fromLineLength(1000));

    for (const gauge of gaugeViews(read, null)) {
      expect(gauge).toEqual({ filled: 1, pending: 0, over: false, amount: '∞' });
    }
  });
});
