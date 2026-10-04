import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../geometry/vec2';
import type { EnemyView } from '../../sandbox/sandbox-world';
import { sandboxWorlds } from '../../sandbox/test-support';
import { EnemiesDrawing } from './enemies-drawing';

const createWorld = sandboxWorlds();

/** A scene whose Graphics keep each polygon it fills and each rectangle, since its last clear. */
function recordingScene() {
  const filled: Vec2[][] = [];
  const rects: number[][] = [];
  let path: Vec2[] = [];
  const own: Record<string, (...args: number[]) => void> = {
    clear: () => {
      filled.length = 0;
      rects.length = 0;
    },
    beginPath: () => void (path = []),
    moveTo: (x, y) => void path.push({ x: x!, y: y! }),
    lineTo: (x, y) => void path.push({ x: x!, y: y! }),
    fillPath: () => void filled.push(path),
    fillRect: (...args) => void rects.push(args),
  };
  // Every call returns the Graphics; the ones above are noted.
  const graphics: unknown = new Proxy(own, {
    get:
      (target, name) =>
      (...args: number[]) => {
        target[name as string]?.(...args);
        return graphics;
      },
  });
  const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
  return { scene, filled, rects };
}

/** A Siege Walker's view as the world has it, going as `going`. */
function walker(going: Partial<EnemyView> = {}): EnemyView {
  const world = createWorld();
  world.spawn('siegeWalker', { x: 600, y: 700 });
  return { ...world.enemies[0]!, ...going };
}

/** Its four legs as drawn: the first four polygons filled. */
function legsDrawn(
  drawing: EnemiesDrawing,
  filled: readonly Vec2[][],
  frames: readonly number[],
): Vec2[][][] {
  return frames.map((now) => {
    drawing.draw(1, now);
    return filled.slice(0, 4).map((leg) => [...leg]);
  });
}

describe("The Siege Walker's drawing", () => {
  it('walks its legs with it', () => {
    const { scene, filled } = recordingScene();
    const view = walker({ velocity: { x: 30, y: 0 } });
    const drawing = new EnemiesDrawing(scene, () => [view]);

    const [first, later] = legsDrawn(drawing, filled, [0, 0.5]);

    expect(later).not.toEqual(first);
  });

  it('stands its legs still when it stalls', () => {
    const { scene, filled } = recordingScene();
    const view = walker({ velocity: { x: 0, y: 0 } });
    const drawing = new EnemiesDrawing(scene, () => [view]);

    const [first, later] = legsDrawn(drawing, filled, [0, 0.5]);

    expect(later).toEqual(first);
  });

  it('flails its legs while it is Tipped, lying still', () => {
    const { scene, filled } = recordingScene();
    const view = walker({ velocity: { x: 0, y: 0 }, tipped: true });
    const drawing = new EnemiesDrawing(scene, () => [view]);

    const [first, later] = legsDrawn(drawing, filled, [0, 0.3]);

    expect(later).not.toEqual(first);
  });

  it('has no small HP bar over its body, hurt or not: its bar is the boss bar', () => {
    const { scene, rects } = recordingScene();
    const view = walker();
    const drawing = new EnemiesDrawing(scene, () => [{ ...view, hp: view.fullHp / 2 }]);

    drawing.draw(1, 0);

    // Only its eyes and Belly window, as rectangles: no bar's border and fill.
    expect(rects).toHaveLength(3);
  });
});
