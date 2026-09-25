import type Phaser from 'phaser';
import { transformPoints } from '../geometry/transform';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { strokeCapsule, strokePolygon } from './draw';
import { PALETTE } from './palette';

/** F1 overlay: collider outlines, body count and fps. */
export class DebugOverlay {
  private readonly colliders: Phaser.GameObjects.Graphics;
  private readonly stats: Phaser.GameObjects.Text;
  private shown = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.colliders = scene.add.graphics().setDepth(100);
    this.stats = scene.add
      .text(60, 130, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#39ff88',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 6 },
      })
      .setDepth(101);
    this.setShown(false);
  }

  toggle(): void {
    this.setShown(!this.shown);
  }

  private setShown(shown: boolean): void {
    this.shown = shown;
    this.colliders.setVisible(shown);
    this.stats.setVisible(shown);
  }

  draw(): void {
    if (!this.shown) return;
    const g = this.colliders;
    g.clear();
    g.lineStyle(2, PALETTE.debug, 1);
    for (const polygon of this.world.arena.terrain) strokePolygon(g, polygon);
    for (const line of this.world.lines) {
      for (const { a, b } of line.segments) strokeCapsule(g, a, b, line.thickness);
    }
    for (const object of this.world.objects) {
      for (const part of object.parts) strokePolygon(g, transformPoints(part, object.transform));
    }

    const fps = this.scene.game.loop.actualFps;
    this.stats.setText(`fps    ${fps.toFixed(0)}\nbodies ${this.world.bodyCount}`);
  }
}
