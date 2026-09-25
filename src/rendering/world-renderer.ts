import type Phaser from 'phaser';
import type { ObjectView, SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { fillCapsule, fillPolygon, strokePolygon } from './draw';
import { PALETTE } from './palette';

type Graphics = Phaser.GameObjects.Graphics;

/**
 * Draws the Sandbox world's state: Terrain, Lines and Objects. Each Stroke
 * gets its own Graphics, drawn once; moving Objects only update its transform.
 */
export class WorldRenderer {
  private readonly lines = new Map<StrokeId, Graphics>();
  private readonly objects = new Map<StrokeId, Graphics>();
  /** Frozen state each Object was last drawn with. */
  private readonly drawnFrozen = new Map<StrokeId, boolean>();

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
      for (const { a, b } of line.segments) fillCapsule(g, a, b, line.thickness, PALETTE.ink);
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
      if (this.drawnFrozen.get(object.id) !== object.frozen) {
        drawObject(g, object);
        this.drawnFrozen.set(object.id, object.frozen);
      }
      g.setPosition(object.transform.x, object.transform.y).setRotation(object.transform.angle);
    }
    removeStale(this.objects, current);
    for (const id of this.drawnFrozen.keys()) if (!current.has(id)) this.drawnFrozen.delete(id);
  }
}

/** Draws an Object in its own coordinates; a Frozen one is tinted and pinned. */
function drawObject(g: Graphics, object: ObjectView): void {
  g.clear();
  g.fillStyle(object.frozen ? PALETTE.frozenFill : PALETTE.objectFill, 1);
  g.lineStyle(3, PALETTE.ink, 1);
  fillPolygon(g, object.outline);
  strokePolygon(g, object.outline);
  if (object.frozen) {
    // A push pin at the centroid.
    g.lineStyle(3, PALETTE.frozenPin, 1);
    g.lineBetween(0, 0, 7, 7);
    g.fillStyle(PALETTE.frozenPin, 1);
    g.fillCircle(0, 0, 7);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(-2, -2, 2.5);
  }
}

function removeStale(graphics: Map<StrokeId, Graphics>, current: Set<StrokeId>): void {
  for (const [id, g] of graphics) {
    if (current.has(id)) continue;
    g.destroy();
    graphics.delete(id);
  }
}
