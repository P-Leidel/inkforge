import type Phaser from 'phaser';
import type { ObjectView, SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { fillPolygon, strokePolygon } from './draw';
import { drawInk, fillInk, INK_HUES, segmentRuns } from './ink';
import { PALETTE } from './palette';

/** Width an Outline is drawn with, centred on the Object's edge. */
const OUTLINE_WIDTH = 5;

type Graphics = Phaser.GameObjects.Graphics;

/**
 * Draws the Sandbox world's state: Terrain, Lines and Objects. Each Stroke
 * gets its own Graphics, drawn once; moving Objects only update its transform.
 */
export class WorldRenderer {
  private readonly lines = new Map<StrokeId, Graphics>();
  private readonly objects = new Map<StrokeId, Graphics>();
  /** The Frozen state and Fill each Object was last drawn with. */
  private readonly drawnLook = new Map<StrokeId, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.drawTerrain(scene.add.graphics());
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
      const look = `${object.frozen} ${object.fill}`;
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

function removeStale(graphics: Map<StrokeId, Graphics>, current: Set<StrokeId>): void {
  for (const [id, g] of graphics) {
    if (current.has(id)) continue;
    g.destroy();
    graphics.delete(id);
  }
}
