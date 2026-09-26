import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DEMOLITION_DEMO } from '../gallery/gallery';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS } from '../materials/colour';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { drawLine, drawObject, sandboxWorlds } from '../sandbox/test-support';
import { bakedTextureUse } from './baked-textures';
import { WorldRenderer } from './world-renderer';

/**
 * The render budget: how many drawing calls (fillCircle, lineBetween and
 * the like) the Graphics on screen may replay in any one frame of the
 * Demolition chain. Phaser replays every call on every frame, circles
 * re-tessellated each time, so a frame's rendering cost grows with it.
 * With Strokes, Patches and Rubble baked, what is left is Debris, Droplets,
 * bonds, Blast rings and the Terrain: the chain peaks at 974. It peaked at
 * 2,485 with Strokes and Patches as Graphics, and at 7,399 with Rubble too.
 */
const REPLAYED_PER_FRAME = 1_500;
/** Drawing calls baked in any one frame after the first, for looks that changed (peak 306). */
const BAKED_PER_FRAME = 1_000;
/** Texture memory for the Demolition scene, bytes (peak 5.1 MB). */
const TEXTURE_BYTES = 8 * 2 ** 20;

const createWorld = sandboxWorlds();

/** A stand-in for a Phaser object: every call returns it, and the ones that draw are counted. */
interface Recorded {
  calls: number;
  visible: boolean;
  destroyed: boolean;
}

/**
 * A stand-in for the Phaser scene the renderer draws into. It keeps the
 * display list and the textures, and counts the drawing calls each Graphics
 * holds (what Phaser replays every frame) and those drawn into textures.
 */
class RecordingScene {
  readonly displayList: Recorded[] = [];
  readonly textures = new Map<string, Recorded & { key: string; width: number; height: number }>();
  /** Drawing calls baked into textures since the last look. */
  baked = 0;

  /** Drawing calls the visible Graphics replay each frame. */
  get replayed(): number {
    return this.displayList.reduce((sum, g) => sum + (g.visible ? g.calls : 0), 0);
  }

  asScene(): Phaser.Scene {
    const record = (onList: boolean) => this.record(onList);
    const textures = this.textures;
    const onBake = (calls: number) => (this.baked += calls);
    return {
      add: { graphics: () => record(true), image: () => record(true) },
      make: { graphics: () => record(false) },
      textures: {
        exists: (key: string) => textures.has(key),
        get: (key: string) => textures.get(key),
        addDynamicTexture(key: string, width: number, height: number) {
          const texture = Object.assign(record(false), { key, width, height });
          const methods = texture as unknown as Record<string, unknown>;
          methods.draw = (g: Recorded) => {
            onBake(g.calls);
            return texture;
          };
          methods.destroy = () => textures.delete(key);
          textures.set(key, texture);
          return texture;
        },
      },
    } as unknown as Phaser.Scene;
  }

  private record(onList: boolean): Recorded {
    const state: Recorded = { calls: 0, visible: true, destroyed: false };
    const own = state as unknown as Record<string | symbol, unknown>;
    const proxy: Recorded = new Proxy(state, {
      get: (target, name) => {
        if (name in target) return own[name];
        return (...args: unknown[]) => {
          if (name === 'clear') target.calls = 0;
          else if (name === 'setVisible') target.visible = Boolean(args[0]);
          else if (name === 'destroy') {
            target.destroyed = true;
            this.displayList.splice(this.displayList.indexOf(proxy), 1);
          } else if (!String(name).startsWith('set') && name !== 'add' && name !== 'render') {
            target.calls++;
          }
          return proxy;
        };
      },
    });
    if (onList) this.displayList.push(proxy);
    return proxy;
  }
}

/** A closed Stroke around a box, sampled every 4 px. */
function box(x: number, y: number, width: number, height: number): Vec2[] {
  const points: Vec2[] = [];
  for (let d = 0; d < width; d += 4) points.push({ x: x + d, y });
  for (let d = 0; d < height; d += 4) points.push({ x: x + width, y: y + d });
  for (let d = 0; d < width; d += 4) points.push({ x: x + width - d, y: y + height });
  for (let d = 0; d < height; d += 4) points.push({ x, y: y + height - d });
  points.push({ x, y });
  return points;
}

/** One frame, as the scene makes it: a step of physics, then the drawing. */
function frame(world: SandboxWorld, renderer: WorldRenderer): void {
  world.step();
  renderer.draw();
}

describe('World renderer: render budget', () => {
  it('keeps every frame of the Demolition chain within the budget', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    DEMOLITION_DEMO.build(world);
    renderer.draw();
    recording.baked = 0;

    let replayed = 0;
    let baked = 0;
    let bytes = 0;
    for (let k = 0; k < 300; k++) {
      frame(world, renderer);
      replayed = Math.max(replayed, recording.replayed);
      baked = Math.max(baked, recording.baked);
      bytes = Math.max(bytes, bakedTextureUse().bytes);
      recording.baked = 0;
    }

    expect(replayed).toBeLessThanOrEqual(REPLAYED_PER_FRAME);
    expect(baked).toBeLessThanOrEqual(BAKED_PER_FRAME);
    expect(bytes).toBeLessThanOrEqual(TEXTURE_BYTES);
    renderer.destroy();
  });

  it('replays nothing for Lines and Objects that stand still, however many there are', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    renderer.draw();
    const empty = recording.replayed;

    COLOURS.forEach((colour, k) => {
      for (let row = 0; row < 4; row++) {
        const y = 200 + (4 * k + row) * 30;
        drawLine(
          world,
          [
            { x: 200 + k * 20, y },
            { x: 900, y: y + 20 },
          ],
          colour,
        );
      }
      drawObject(world, box(1100 + k * 150, 300, 90, 60), colour);
      world.fillAt({ x: 1145 + k * 150, y: 330 }, colour);
    });
    renderer.draw();
    recording.baked = 0;
    for (let k = 0; k < 10; k++) renderer.draw();

    expect(world.lines).toHaveLength(20);
    expect(world.objects).toHaveLength(5);
    expect(recording.replayed).toBe(empty);
    // And their looks, unchanged, are not baked again.
    expect(recording.baked).toBe(0);
    renderer.destroy();
  });

  it('frees the textures of what is gone, and all of them when it is destroyed', () => {
    const before = bakedTextureUse();
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    renderer.draw();
    const atlas = recording.textures.size;
    DEMOLITION_DEMO.build(world);
    renderer.draw();
    expect(recording.textures.size).toBeGreaterThan(atlas);

    world.clear();
    renderer.draw();
    expect(recording.textures.size).toBe(atlas);

    renderer.destroy();
    expect(recording.textures.size).toBe(0);
    expect(bakedTextureUse()).toEqual(before);
  });
});
