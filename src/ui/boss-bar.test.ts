import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../rendering/palette';
import { BossBar, bossBarOver } from './boss-bar';

/** A scene 1600 wide whose Graphics note their fillRects, and whose Text keeps what it says. */
function recordingScene() {
  const rects: number[][] = [];
  const fills: unknown[] = [];
  const label = { text: '' };
  const chain = <T extends object>(object: T) =>
    new Proxy(object, {
      get: (target, name) =>
        name in target ? (target as Record<string | symbol, unknown>)[name] : () => proxy(target),
    });
  const proxy = (target: object): unknown => chain(target);
  const graphics = chain({
    clear() {
      rects.length = 0;
      fills.length = 0;
      return graphics;
    },
    fillStyle(colour: unknown) {
      fills.push(colour);
      return graphics;
    },
    fillRect(...args: number[]) {
      rects.push(args);
      return graphics;
    },
  });
  const text = chain({
    setText(said: string) {
      label.text = said;
      return text;
    },
  });
  const scene = {
    scale: { width: 1600 },
    add: { graphics: () => graphics, text: () => text },
  } as unknown as Phaser.Scene;
  return { scene, rects, fills, label };
}

describe('The boss bar', () => {
  it('stands top-centre', () => {
    const over = bossBarOver(1600);

    expect((over.minX + over.maxX) / 2).toBe(800);
    expect(over.maxX - over.minX).toBeGreaterThan(400);
  });

  it("shows the boss's HP left as a large bar, labelled with its name, while there is one", () => {
    const { scene, rects, fills, label } = recordingScene();
    const bar = new BossBar(scene);

    bar.draw({ boss: { name: 'Siege Walker', hp: 50, fullHp: 200 } });

    expect(label.text).toBe('Siege Walker');
    expect(rects).toHaveLength(2);
    const [border, left] = rects as [number[], number[]];
    expect(left[2]! / (border[2]! - 4)).toBeCloseTo(0.25);
    // A large bar: 8 px tall.
    expect(left[3]).toBe(8);
    expect(fills).toEqual([PALETTE.hpEmpty, PALETTE.hpLow]);
  });

  it('goes once the boss dies or goes', () => {
    const { scene, rects, label } = recordingScene();
    const bar = new BossBar(scene);
    bar.draw({ boss: { name: 'Siege Walker', hp: 200, fullHp: 200 } });

    bar.draw({ boss: null });

    expect(rects).toEqual([]);
    expect(label.text).toBe('');
  });
});
