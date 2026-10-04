import { describe, expect, it } from 'vitest';
import { drawHpBar, hpShare } from './hp-bar';
import { PALETTE } from './palette';

/** A Graphics that notes what it is asked to draw. */
function recorder() {
  const calls: unknown[][] = [];
  return {
    calls,
    g: {
      fillStyle(...args: unknown[]) {
        calls.push(['fillStyle', ...args]);
        return this;
      },
      fillRect(...args: unknown[]) {
        calls.push(['fillRect', ...args]);
        return this;
      },
    } as unknown as Parameters<typeof drawHpBar>[0],
  };
}

describe('An HP bar', () => {
  it('shows the share of HP left, clamped to 0–1, and none without a full HP', () => {
    expect(hpShare(30, 60)).toBe(0.5);
    expect(hpShare(-5, 60)).toBe(0);
    expect(hpShare(90, 60)).toBe(1);
    expect(hpShare(10, 0)).toBe(0);
  });

  it('floats above what it belongs to, as wide as it, on a border', () => {
    const { g, calls } = recorder();

    drawHpBar(g, { minX: 100, minY: 200, maxX: 140 }, 30, 40, 'small');

    expect(calls).toEqual([
      ['fillStyle', PALETTE.hpEmpty, 1],
      ['fillRect', 99, 189, 42, 6],
      ['fillStyle', PALETTE.hpFull, 1],
      ['fillRect', 100, 190, 30, 4],
    ]);
  });

  it('is bigger over the Ink Core, and red once low', () => {
    const { g, calls } = recorder();

    drawHpBar(g, { minX: 0, minY: 100, maxX: 96 }, 2, 10, 'large');

    expect(calls).toEqual([
      ['fillStyle', PALETTE.hpEmpty, 1],
      ['fillRect', -2, 78, 100, 12],
      ['fillStyle', PALETTE.hpLow, 1],
      ['fillRect', 0, 80, 96 * 0.2, 8],
    ]);
  });
});
