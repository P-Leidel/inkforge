import type Phaser from 'phaser';
import type { Vec2 } from '../../geometry/vec2';
import type { Entry, ObjectView, StrokeId } from '../../sandbox/sandbox-world';
import { BakedDrawing, bakeInto } from '../baked-textures';
import { fillPolygon, strokePolyline } from '../draw';
import { drawInk, fillInk, hash, INK_HUES, inkReach } from '../ink';
import { PALETTE } from '../palette';
import { drawPin, PIN_REACH } from '../pin';
import { rectAround } from '../tiles';
import { CRACK_WIDTH, crackStage } from './cracks';
import { drawn, type DrawnKind } from './drawn-kind';

type Graphics = Phaser.GameObjects.Graphics;

/** Width an Outline is drawn with, centred on the Object's edge. */
const OUTLINE_WIDTH = 5;

/** An Object as drawn: its texture, once baked, and what it was last baked with. */
interface DrawnObject {
  drawing: BakedDrawing | null;
  frozen: boolean;
  stage: number;
  /** Whether its Fill changed, or it was Released, since it was last baked. */
  stale: boolean;
}

/**
 * The Objects, each baked in one texture of its own that moves and turns
 * with it. It is baked when first drawn, and again when its Fill changes,
 * it is Released, a hit or a Blast wakes it, or its crack stage changes.
 */
export class ObjectsDrawing implements DrawnKind {
  private readonly objects = new Map<StrokeId, DrawnObject>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly views: () => readonly ObjectView[],
  ) {}

  /** The ids of the Objects it holds a drawing for. */
  held(): StrokeId[] {
    return [...this.objects.keys()];
  }

  follow(entry: Entry): void {
    if (entry.kind === 'added' && entry.what.thing === 'object') {
      this.objects.set(entry.what.id, { drawing: null, frozen: true, stage: 0, stale: true });
    } else if (entry.kind === 'went' && entry.what.thing === 'object') {
      this.objects.get(entry.what.id)?.drawing?.destroy();
      this.objects.delete(entry.what.id);
    } else if (entry.kind === 'filled' || entry.kind === 'released') {
      // Its look changed: baked again when next drawn.
      const object = this.objects.get(entry.id);
      if (object) object.stale = true;
    }
  }

  dropAll(): void {
    for (const { drawing } of this.objects.values()) drawing?.destroy();
    this.objects.clear();
  }

  /** Bakes each Object again when its look changed, and places it. */
  draw(fraction: number): void {
    for (const object of this.views()) {
      const drawnObject = this.objects.get(object.id);
      if (!drawnObject) continue;
      const stage = crackStage(object.wear);
      if (
        drawnObject.stale ||
        drawnObject.frozen !== object.frozen ||
        drawnObject.stage !== stage
      ) {
        drawnObject.drawing ??= new BakedDrawing(
          this.scene,
          rectAround(
            [...object.outline, { x: -PIN_REACH, y: -PIN_REACH }, { x: PIN_REACH, y: PIN_REACH }],
            inkReach(object.colour, OUTLINE_WIDTH),
          ),
        );
        bakeInto(this.scene, [drawnObject.drawing], (g) => drawObject(g, object));
        drawnObject.frozen = object.frozen;
        drawnObject.stage = stage;
        drawnObject.stale = false;
      }
      const { x, y, angle } = drawn(object, fraction);
      drawnObject.drawing!.image.setPosition(x, y).setRotation(angle);
    }
  }
}

/**
 * Draws an Object in its own coordinates: its Outline in its Colour around
 * its Fill, or around a faintly tinted, hollow inside. A Frozen one is pinned.
 */
function drawObject(g: Graphics, object: ObjectView): void {
  if (object.fill) {
    fillInk(g, object.fill, object.outline);
  } else {
    g.fillStyle(INK_HUES[object.colour], 0.1);
    fillPolygon(g, object.outline);
  }
  drawInk(g, object.colour, object.outline, true, OUTLINE_WIDTH);
  drawCracks(g, object);
  if (object.frozen) drawPin(g, { x: 0, y: 0 });
}

/**
 * One jagged crack per stage, each from a point of the Outline most of the
 * way towards the centre (the body's origin). Placed by the Object's id, so
 * each Object cracks the same way every time.
 */
function drawCracks(g: Graphics, object: ObjectView): void {
  const stages = crackStage(object.wear);
  if (stages === 0) return;
  const { outline } = object;
  g.lineStyle(CRACK_WIDTH, object.colour === 'black' ? PALETTE.crackOnBlack : PALETTE.crack, 0.9);
  for (let k = 0; k < stages; k++) {
    const seed = object.id * 7 + k * 3;
    const start = outline[Math.floor(hash(seed) * outline.length)]!;
    const points: Vec2[] = [start];
    const steps = 4;
    const reach = 0.55 + 0.25 * hash(seed + 1);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * reach;
      // Zigzag across the straight path, less towards the tip.
      const side = (i % 2 === 0 ? 1 : -1) * (hash(seed + i + 2) * 0.25 + 0.05) * (1 - t);
      points.push({
        x: start.x * (1 - t) - start.y * side,
        y: start.y * (1 - t) + start.x * side,
      });
    }
    strokePolyline(g, points);
  }
}
