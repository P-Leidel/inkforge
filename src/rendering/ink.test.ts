import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import { drawInk, inkReach } from './ink';

/** Stands in for a Graphics, keeping how far from y = 0 anything it is given reaches. */
function extentRecorder() {
  let lineWidth = 0;
  const extent = { up: 0, down: 0 };
  const reach = (top: number, bottom: number) => {
    extent.up = Math.max(extent.up, -top);
    extent.down = Math.max(extent.down, bottom);
  };
  const g = {
    lineStyle: (width: number) => ((lineWidth = width), g),
    fillStyle: () => g,
    lineBetween: (_x1: number, y1: number, _x2: number, y2: number) => (
      reach(Math.min(y1, y2) - lineWidth / 2, Math.max(y1, y2) + lineWidth / 2),
      g
    ),
    fillCircle: (_x: number, y: number, r: number) => (reach(y - r, y + r), g),
    fillRect: (_x: number, y: number, _w: number, h: number) => (reach(y, y + h), g),
  };
  return { g: g as unknown as Phaser.GameObjects.Graphics, extent };
}

describe('Ink', () => {
  it('stays within its reach of the path, drips and all', () => {
    for (const colour of COLOURS) {
      for (const width of [4, 8, 12]) {
        const { g, extent } = extentRecorder();
        const path = Array.from({ length: 20 }, (_, k) => ({ x: k * 10, y: 0 }));
        drawInk(g, colour, path, false, width);
        expect(extent.up).toBeLessThanOrEqual(inkReach(colour, width) - 1);
        expect(extent.down).toBeLessThanOrEqual(inkReach(colour, width) - 1);
      }
    }
  });
});
