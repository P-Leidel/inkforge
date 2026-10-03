import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DEMOLITION_DEMO } from '../gallery/gallery';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS } from '../materials/colour';
import { createMaterialTable } from '../materials/material-table';
import { STEP_SECONDS, type SandboxWorld } from '../sandbox/sandbox-world';
import {
  drawLine,
  drawObject,
  entriesOf,
  hear,
  objectById,
  runFor,
  sandboxWorlds,
} from '../sandbox/test-support';
import { dragBox } from '../stroke/pointer-paths';
import { bakedTextureUse } from './baked-textures';
import { WorldRenderer } from './world-renderer';

/**
 * The render budget: how many drawing calls (fillCircle, lineBetween and
 * the like) the Graphics on screen may replay in any one frame of the
 * Demolition chain. Phaser replays every call on every frame, circles
 * re-tessellated each time, so a frame's rendering cost grows with it.
 * With Strokes, Patches and Rubble baked, what is left is Debris, Droplets,
 * bonds, Blast rings and the Terrain: the chain peaks at 2,003, about 1,700
 * of it Debris, 8 calls a square. (The 974 once given here, and the 2,485
 * with Strokes and Patches as Graphics and 7,399 with Rubble too, were
 * counted while the recording lost Graphics from its display list, Debris's
 * among them.)
 */
const REPLAYED_PER_FRAME = 2_500;
/** Drawing calls baked in any one frame after the first, for looks that changed (peak 306). */
const BAKED_PER_FRAME = 1_000;
/** Texture memory for the Demolition scene, bytes (peak 5.1 MB). */
const TEXTURE_BYTES = 8 * 2 ** 20;

const createWorld = sandboxWorlds();

/**
 * A stand-in for a Phaser object: every call returns it, the ones that draw
 * are counted, and where it was last placed is kept.
 */
interface Recorded {
  calls: number;
  visible: boolean;
  destroyed: boolean;
  position: Vec2 | null;
  alpha: number;
}

/**
 * A stand-in for the Phaser scene the renderer draws into. It keeps the
 * display list and the textures, and counts the drawing calls each Graphics
 * holds (what Phaser replays every frame) and those drawn into textures.
 */
class RecordingScene {
  readonly displayList: Recorded[] = [];
  /** Every object placed with `setPosition`, on the display list or not. */
  readonly placed: Recorded[] = [];
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
    const state: Recorded = {
      calls: 0,
      visible: true,
      destroyed: false,
      position: null,
      alpha: 1,
    };
    const own = state as unknown as Record<string | symbol, unknown>;
    const proxy: Recorded = new Proxy(state, {
      get: (target, name) => {
        if (name in target) return own[name];
        return (...args: unknown[]) => {
          if (name === 'clear') target.calls = 0;
          else if (name === 'setVisible') target.visible = Boolean(args[0]);
          else if (name === 'setAlpha') target.alpha = Number(args[0]);
          else if (name === 'setPosition') {
            if (!target.position) this.placed.push(proxy);
            target.position = { x: Number(args[0]), y: Number(args[1]) };
          } else if (name === 'destroy') {
            target.destroyed = true;
            // One off the display list, such as a texture's image, leaves the list as it is.
            const at = this.displayList.indexOf(proxy);
            if (at >= 0) this.displayList.splice(at, 1);
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

/** The ids of the world's Lines, Objects, Rubble and Patches. */
function idsIn(world: SandboxWorld) {
  return {
    lines: world.lines.map((l) => l.id),
    objects: world.objects.map((o) => o.id),
    rubble: world.rubble.map((r) => r.id),
    patches: world.patches.map((p) => p.id),
  };
}

const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

/** The ids the renderer holds a drawing for, each list in id order. */
function idsHeld(renderer: WorldRenderer) {
  const { lines, objects, rubble, patches } = renderer.held();
  return {
    lines: sorted(lines),
    objects: sorted(objects),
    rubble: sorted(rubble),
    patches: sorted(patches),
  };
}

/** A renderer on a recording scene, and the recording. */
function renderWorld(world: SandboxWorld) {
  const recording = new RecordingScene();
  const renderer = new WorldRenderer(recording.asScene(), world);
  return { recording, renderer };
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

  it('replays a few dozen drawing calls per Enemy, however many there are', () => {
    const world = createWorld();
    const { recording, renderer } = renderWorld(world);
    renderer.draw();
    const empty = recording.replayed;

    world.spawn('crawler');
    renderer.draw();
    const one = recording.replayed - empty;
    for (let k = 0; k < 9; k++) world.spawn('crawler');
    renderer.draw();

    expect(one).toBeLessThan(40);
    expect(recording.replayed - empty).toBe(10 * one);
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

describe('World renderer: between steps', () => {
  it('draws a falling Object halfway between its two poses halfway through a step', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    const id = drawObject(world, box(900, 200, 60, 60));
    world.togglePause();
    world.release(id);
    world.advance(3 * STEP_SECONDS);

    world.advance(1.5 * STEP_SECONDS);
    renderer.draw();

    const { previousTransform: from, transform: to } = objectById(world, id);
    expect(to.y - from.y).toBeGreaterThan(1);
    const placed = recording.placed;
    expect(placed).toHaveLength(1); // the Object's image, and nothing else
    expect(placed[0]!.position!.x).toBeCloseTo((from.x + to.x) / 2, 6);
    expect(placed[0]!.position!.y).toBeCloseTo((from.y + to.y) / 2, 6);
    renderer.destroy();
  });

  it('draws each Run of a Line cut in two on its own: what stands stays put, what falls moves', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    renderer.draw();
    const bare = recording.textures.size;
    const id = drawLine(world, [
      { x: 400, y: 880 },
      { x: 400, y: 880 - 5 * 48 },
    ]);
    renderer.draw();

    world.eraseAlong([{ x: 400, y: 880 - 2.5 * 48 }], 4); // Piece 2: the top two fall
    const fell = world.lines.find((line) => line.id === id)!.runs[1]!.transform.y;
    world.togglePause();
    world.advance(20 * STEP_SECONDS);
    world.togglePause();
    renderer.draw();

    const [, top] = world.lines.find((line) => line.id === id)!.runs;
    expect(top!.transform.y).toBeGreaterThan(fell + 5);
    // The falling Run's tiles go where it is now; the standing Run's are never moved.
    const placed = recording.placed.filter((tile) => !tile.destroyed);
    expect(placed.length).toBeGreaterThan(0);
    for (const tile of placed)
      expect(tile.position).toEqual({ x: top!.transform.x, y: top!.transform.y });
    expect(recording.textures.size - bare).toBeGreaterThan(placed.length);
    renderer.destroy();
  });

  it('keeps each Run’s tiles its own when the Runs change places along the Line', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    // A bridge standing on both feet: Pieces 0 and 7 lie on the ground.
    const id = drawLine(world, [
      { x: 300, y: 880 },
      { x: 348, y: 880 },
      { x: 348, y: 784 },
      { x: 444, y: 784 },
      { x: 444, y: 880 },
      { x: 492, y: 880 },
    ]);
    const runsOf = () => world.lines.find((line) => line.id === id)!.runs;
    world.eraseAlong([{ x: 348, y: 856 }], 4); // Piece 1
    world.eraseAlong([{ x: 420, y: 784 }], 4); // Piece 4: Pieces 2 and 3 fall
    renderer.draw();
    expect(runsOf().map((run) => run.pieces[0]!.index)).toEqual([0, 2]);

    world.eraseAlong([{ x: 310, y: 880 }], 4); // Piece 0: what stands now comes after what fell
    expect(runsOf().map((run) => [run.grounded, run.pieces[0]!.index])).toEqual([
      [false, 2],
      [true, 5],
    ]);
    world.togglePause();
    world.advance(10 * STEP_SECONDS);
    world.togglePause();
    renderer.draw();

    // The falling Run's tiles go where it is now; the standing Run's are never moved.
    const [fallen] = runsOf();
    const placed = recording.placed.filter((tile) => !tile.destroyed);
    expect(placed.length).toBeGreaterThan(0);
    for (const tile of placed)
      expect(tile.position).toEqual({ x: fallen!.transform.x, y: fallen!.transform.y });
    renderer.destroy();
  });

  it('draws the pose now while paused', () => {
    const world = createWorld();
    const recording = new RecordingScene();
    const renderer = new WorldRenderer(recording.asScene(), world);
    const id = drawObject(world, box(900, 200, 60, 60));
    world.togglePause();
    world.release(id);
    world.advance(4.5 * STEP_SECONDS);

    world.togglePause();
    renderer.draw();

    const { transform } = objectById(world, id);
    const [placed] = recording.placed;
    expect(placed!.position).toEqual({ x: transform.x, y: transform.y });
    renderer.destroy();
  });
});

describe('World renderer: by what happened', () => {
  it('holds exactly the world’s ids every frame of the Demolition chain, through R and Clear', () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    DEMOLITION_DEMO.build(world);
    renderer.draw();
    const expectInStep = () => {
      const want = idsIn(world);
      expect(idsHeld(renderer)).toEqual({
        lines: sorted(want.lines),
        objects: sorted(want.objects),
        rubble: sorted(want.rubble),
        patches: sorted(want.patches),
      });
    };
    expectInStep();

    let seen = { rubble: 0, patches: 0 };
    for (let k = 0; k < 300; k++) {
      // Two steps between some frames, as a slow frame takes.
      world.step();
      if (k % 3 === 0) world.step();
      renderer.draw();
      expectInStep();
      seen = {
        rubble: Math.max(seen.rubble, world.rubble.length),
        patches: Math.max(seen.patches, world.patches.length),
      };
    }
    expect(seen.rubble).toBeGreaterThan(0);
    expect(seen.patches).toBeGreaterThan(0);

    world.reset();
    renderer.draw();
    expectInStep();
    expect(renderer.held().objects.length).toBeGreaterThan(0);

    world.clear();
    renderer.draw();
    expect(renderer.held()).toEqual({ lines: [], objects: [], rubble: [], patches: [] });
    renderer.destroy();
  });

  it('must start on a world with nothing in it', () => {
    const world = createWorld();
    drawObject(world, box(900, 200, 60, 60));

    expect(() => renderWorld(world)).toThrow();
  });

  it('bakes an Object again when it is filled, and only then', () => {
    const world = createWorld();
    const { recording, renderer } = renderWorld(world);
    drawObject(world, box(900, 200, 60, 60));
    renderer.draw();
    recording.baked = 0;
    renderer.draw();
    expect(recording.baked).toBe(0);

    world.fillAt({ x: 930, y: 230 }, 'black');
    renderer.draw();

    expect(recording.baked).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('bursts Debris where something broke; it falls through everything and is gone in about 2 s', () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    const ball = drawObject(world, box(900, 200, 40, 40), 'red');
    world.togglePause();
    world.release(ball);
    const heard = hear(world);
    while (entriesOf(heard(), 'burst').length === 0) world.step();
    renderer.draw();
    const burst = renderer.debrisCount;
    expect(burst).toBeGreaterThan(0);
    const bodies = world.bodyCount;

    runFor(world, 1.9);
    renderer.draw();
    expect(renderer.debrisCount).toBe(burst);
    expect(world.bodyCount).toBe(bodies);

    runFor(world, 0.2);
    renderer.draw();
    expect(renderer.debrisCount).toBe(0);
    renderer.destroy();
  });

  it('keeps Debris still while paused, and drops it on R and on Clear', () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    const ball = drawObject(world, box(900, 200, 40, 40), 'red');
    world.togglePause();
    world.release(ball);
    const heard = hear(world);
    while (entriesOf(heard(), 'burst').length === 0) world.step();
    world.togglePause();
    renderer.draw();
    const burst = renderer.debrisCount;

    for (let k = 0; k < 200; k++) renderer.draw(); // paused: no time passes
    expect(renderer.debrisCount).toBe(burst);

    world.reset();
    renderer.draw();
    expect(renderer.debrisCount).toBe(0);

    world.togglePause();
    world.release(ball);
    while (entriesOf(heard(), 'burst').length < 2) world.step();
    renderer.draw();
    expect(renderer.debrisCount).toBeGreaterThan(0);
    world.clear();
    renderer.draw();
    expect(renderer.debrisCount).toBe(0);
    renderer.destroy();
  });

  it('fades out Rubble the cap removed where it was, and then frees it', () => {
    const materials = createMaterialTable();
    materials.rubbleCap = 3;
    const world = createWorld({ materials });
    const { recording, renderer } = renderWorld(world);
    const pot = drawObject(world, dragBox(900, 200, 60, 60));
    world.fillAt({ x: 930, y: 230 }, 'grey');
    world.materials.colours.grey.outline.durability = 1;
    renderer.draw();
    world.togglePause();
    world.release(pot);
    const heard = hear(world);
    while (!entriesOf(heard(), 'went').some(({ why }) => why === 'capped')) world.step();
    const capped = entriesOf(heard(), 'went').filter(({ why }) => why === 'capped').length;
    const images = recording.displayList.length;

    renderer.draw();
    // The capped Rubble's images stay, to fade out: the Object's went.
    expect(renderer.held().rubble).toHaveLength(3);
    expect(recording.displayList.length).toBe(images - 1 + 3 + capped);

    runFor(world, 0.4);
    renderer.draw();
    expect(recording.displayList.length).toBe(images - 1 + 3 + capped);
    runFor(world, 0.2); // 0.5 s after the cap
    renderer.draw();
    expect(recording.displayList.length).toBe(images - 1 + 3);
    renderer.destroy();
  });

  it('fades Rubble out over the last 0.5 s of its lifetime, and frees it when it expires', () => {
    const world = createWorld();
    const { recording, renderer } = renderWorld(world);
    const pot = drawObject(world, dragBox(900, 200, 60, 60));
    world.fillAt({ x: 930, y: 230 }, 'black');
    world.materials.colours.grey.outline.durability = 1;
    renderer.draw();
    world.togglePause();
    world.release(pot);
    while (world.rubble.length === 0) world.step();
    const images = () => recording.displayList.slice(-world.rubble.length);
    const alphas = () => images().map(({ alpha }) => alpha);
    renderer.draw();
    const stones = images();
    expect(alphas().every((alpha) => alpha === 1)).toBe(true);

    while (world.rubble[0]!.remaining > 0.25 + 1e-9) world.step();
    renderer.draw();
    for (const alpha of alphas()) expect(alpha).toBeCloseTo(0.5, 9);

    while (world.rubble.length > 0) world.step();
    renderer.draw();
    expect(renderer.held().rubble).toEqual([]);
    expect(stones.every(({ destroyed }) => destroyed)).toBe(true);
    renderer.destroy();
  });

  it('bursts a pop of Debris where an Enemy died', () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    world.spawn('crawler', { x: 500, y: 860 });
    runFor(world, 0.2);
    renderer.draw();
    expect(renderer.debrisCount).toBe(0);
    // Its HP runs out at the next hit: a box dropped on it.
    world.enemyTable.types.crawler.hp = 1;
    const box = drawObject(world, dragBox(490, 600, 40, 40));
    world.fillAt({ x: 510, y: 620 }, 'black');
    world.release(box);

    const died = () => world.enemies.length === 0;
    for (let step = 0; step < 120 && !died(); step++) world.step();
    renderer.draw();

    expect(died()).toBe(true);
    expect(renderer.debrisCount).toBeGreaterThan(0);
    renderer.destroy();
  });

  it("flies a Drop's dots from where an Enemy died to the gauges, in real time, paused or not", () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    world.spawn('crawler', { x: 500, y: world.arena.height + 200 });
    world.togglePause();
    world.step(); // below the screen: it dies and drops
    world.pause();

    renderer.draw();
    expect(renderer.dropDotCount).toBeGreaterThan(0);
    renderer.draw(0.5);
    expect(renderer.dropDotCount).toBeGreaterThan(0);
    renderer.draw(0.5);
    expect(renderer.dropDotCount).toBe(0);
    renderer.destroy();
  });

  it('bursts a puff of Debris where a Patch was used up', () => {
    const world = createWorld();
    const { renderer } = renderWorld(world);
    // A blue-filled box breaks on the ground and spills Patches there.
    const pot = drawObject(world, dragBox(470, 700, 60, 60), 'grey');
    world.fillAt({ x: 500, y: 730 }, 'blue');
    world.materials.colours.grey.outline.durability = 1;
    world.togglePause();
    world.release(pot);
    runFor(world, 3); // the Spill has landed, and its Debris is gone
    renderer.draw();
    expect(world.patches.length).toBeGreaterThan(0);
    expect(renderer.debrisCount).toBe(0);
    world.materials.patchCapacity = 0; // used up at the next use
    const heard = hear(world);
    const ball = drawObject(world, dragBox(480, 500, 40, 40));
    world.fillAt({ x: 500, y: 520 }, 'black');
    world.release(ball);

    while (!entriesOf(heard(), 'went').some(({ why }) => why === 'used-up')) world.step();
    renderer.draw();

    expect(entriesOf(heard(), 'burst')).toEqual([]);
    expect(renderer.debrisCount).toBeGreaterThan(0);
    renderer.destroy();
  });
});
