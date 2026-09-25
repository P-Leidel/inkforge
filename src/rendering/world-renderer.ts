import type Phaser from 'phaser';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { fillPolygon, strokePolygon } from './draw';
import { PALETTE } from './palette';

/** Draws the Sandbox world's state: Terrain, Lines and Objects. */
export class WorldRenderer {
  private readonly terrain: Phaser.GameObjects.Graphics;
  private readonly bodies: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.terrain = scene.add.graphics();
    this.bodies = scene.add.graphics();
    this.drawTerrain();
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.fillStyle(PALETTE.terrainFill, 1);
    g.lineStyle(2, PALETTE.terrainEdge, 1);
    for (const polygon of this.world.arena.terrain) {
      fillPolygon(g, polygon);
      strokePolygon(g, polygon);
    }
  }

  draw(): void {
    this.bodies.clear();
  }
}
