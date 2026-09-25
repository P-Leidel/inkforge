import type Phaser from 'phaser';
import type { SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { fillCapsule, fillPolygon, strokePolygon } from './draw';
import { PALETTE } from './palette';

type Graphics = Phaser.GameObjects.Graphics;

/**
 * Draws the Sandbox world's state: Terrain, Lines and Objects. Each Stroke
 * gets its own Graphics, drawn once; moving Objects only update its transform.
 */
export class WorldRenderer {
  private readonly lines = new Map<StrokeId, Graphics>();

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
}

function removeStale(graphics: Map<StrokeId, Graphics>, current: Set<StrokeId>): void {
  for (const [id, g] of graphics) {
    if (current.has(id)) continue;
    g.destroy();
    graphics.delete(id);
  }
}
