import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import type { ObjectView, SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { fillPolygon, strokePolygon, strokePolyline } from './draw';
import { drawInk, fillInk, hash, INK_HUES, segmentRuns } from './ink';
import { PALETTE } from './palette';

/** Width an Outline is drawn with, centred on the Object's edge. */
const OUTLINE_WIDTH = 5;

type Graphics = Phaser.GameObjects.Graphics;

/** Wear at which each of the three crack stages shows. */
const CRACK_STAGES = [0.25, 0.5, 0.75];
const CRACK_WIDTH = 2;
const DEBRIS_DEPTH = 5;

/**
 * Draws the Sandbox world's state: Terrain, Lines, Objects and Debris. Each
 * Stroke gets its own Graphics, drawn again only when its look changes;
 * moving Objects only update its transform. Debris is redrawn every frame.
 */
export class WorldRenderer {
  private readonly lines = new Map<StrokeId, Graphics>();
  private readonly objects = new Map<StrokeId, Graphics>();
  /** The Frozen state and Fill each Object was last drawn with. */
  private readonly drawnLook = new Map<StrokeId, string>();
  private readonly debris: Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.drawTerrain(scene.add.graphics());
    this.debris = scene.add.graphics().setDepth(DEBRIS_DEPTH);
  }

  private drawTerrain(g: Graphics): void {
    g.fillStyle(PALETTE.terrainFill, 1);
    g.lineStyle(2, PALETTE.terrainEdge, 1);
    for (const polygon of this.world.arena.terrain) {
      fillPolygon(g, polygon);
      strokePolygon(g, polygon);
    }
  }

  draw(): void {
    this.syncLines();
    this.syncObjects();
    this.drawDebris();
  }

  /** Each particle as a small tumbling square in its Colour, fading out. */
  private drawDebris(): void {
    const g = this.debris;
    g.clear();
    for (const { colour, size, position, angle, opacity } of this.world.debrisParticles) {
      const c = (Math.cos(angle) * size) / 2;
      const s = (Math.sin(angle) * size) / 2;
      g.fillStyle(INK_HUES[colour], opacity);
      fillPolygon(g, [
        { x: position.x - c + s, y: position.y - s - c },
        { x: position.x + c + s, y: position.y + s - c },
        { x: position.x + c - s, y: position.y + s + c },
        { x: position.x - c - s, y: position.y - s + c },
      ]);
    }
  }

  private syncLines(): void {
    const current = new Set<StrokeId>();
    for (const line of this.world.lines) {
      current.add(line.id);
      if (this.lines.has(line.id)) continue;
      const g = this.scene.add.graphics();
      for (const run of segmentRuns(line.segments)) {
        drawInk(g, line.colour, run, false, line.thickness);
      }
      this.lines.set(line.id, g);
    }
    removeStale(this.lines, current);
  }

  private syncObjects(): void {
    const current = new Set<StrokeId>();
    for (const object of this.world.objects) {
      current.add(object.id);
      let g = this.objects.get(object.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.objects.set(object.id, g);
      }
      const look = `${object.frozen} ${object.fill} ${crackStage(object.wear)}`;
      if (this.drawnLook.get(object.id) !== look) {
        drawObject(g, object);
        this.drawnLook.set(object.id, look);
      }
      g.setPosition(object.transform.x, object.transform.y).setRotation(object.transform.angle);
    }
    removeStale(this.objects, current);
    for (const id of this.drawnLook.keys()) if (!current.has(id)) this.drawnLook.delete(id);
  }
}

/**
 * Draws an Object in its own coordinates: its Outline in its Colour around
 * its Fill, or around a faintly tinted, hollow inside. A Frozen one is pinned.
 */
function drawObject(g: Graphics, object: ObjectView): void {
  g.clear();
  if (object.fill) {
    fillInk(g, object.fill, object.outline);
  } else {
    g.fillStyle(INK_HUES[object.colour], 0.1);
    fillPolygon(g, object.outline);
  }
  drawInk(g, object.colour, object.outline, true, OUTLINE_WIDTH);
  drawCracks(g, object);
  if (object.frozen) {
    // A push pin at the centroid, in neutral white so it reads on every Colour.
    g.lineStyle(3, PALETTE.frozenPinEdge, 1);
    g.lineBetween(0, 0, 8, 8);
    g.fillStyle(PALETTE.frozenPin, 1);
    g.fillCircle(0, 0, 7);
    g.lineStyle(2, PALETTE.frozenPinEdge, 1);
    g.strokeCircle(0, 0, 7);
  }
}

/** How many crack stages an Object's wear shows: 0 to 3. */
function crackStage(wear: number): number {
  return CRACK_STAGES.filter((stage) => wear >= stage).length;
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

function removeStale(graphics: Map<StrokeId, Graphics>, current: Set<StrokeId>): void {
  for (const [id, g] of graphics) {
    if (current.has(id)) continue;
    g.destroy();
    graphics.delete(id);
  }
}
