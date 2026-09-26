import type Phaser from 'phaser';
import { transformPoints } from '../geometry/transform';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { strokeCapsule, strokePolygon } from './draw';
import type { FrameTimes } from './frame-times';
import { PALETTE } from './palette';

/**
 * F1 overlay: collider outlines, each Piece's and Object's durability, Blast
 * rings with their full reach, body count and fps. Rubble never breaks, so
 * it gets no label. While the Demolition scene runs, also the average fps and
 * the longest frame since it started.
 */
export class DebugOverlay {
  private readonly colliders: Phaser.GameObjects.Graphics;
  private readonly stats: Phaser.GameObjects.Text;
  /** Durability labels, reused from frame to frame. */
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private shown = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.colliders = scene.add.graphics().setDepth(100);
    // Under the gallery row of buttons.
    this.stats = scene.add
      .text(60, 180, '', {
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
    if (!shown) for (const label of this.labels) label.setVisible(false);
  }

  private label(k: number): Phaser.GameObjects.Text {
    let label = this.labels[k];
    if (!label) {
      label = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#39ff88',
          backgroundColor: '#000000aa',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5)
        .setDepth(101);
      this.labels[k] = label;
    }
    return label;
  }

  /** Draws the overlay, with the frame times since the scene started if given. */
  draw(frames: FrameTimes | null = null): void {
    if (!this.shown) return;
    const g = this.colliders;
    g.clear();
    g.lineStyle(2, PALETTE.debug, 1);
    for (const polygon of this.world.arena.terrain) strokePolygon(g, polygon);
    for (const line of this.world.lines) {
      for (const { a, b } of line.segments) strokeCapsule(g, a, b, line.thickness);
    }
    for (const { transform: t, radius } of this.world.rubble) {
      g.strokeCircle(t.x, t.y, radius);
      // A spoke, to show it rolling.
      g.lineBetween(t.x, t.y, t.x + radius * Math.cos(t.angle), t.y + radius * Math.sin(t.angle));
    }
    g.fillStyle(PALETTE.debug, 1);
    for (const { centre, radius, reach } of this.world.blasts) {
      g.strokeCircle(centre.x, centre.y, radius);
      // Its reach, dotted.
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 24) {
        g.fillCircle(centre.x + reach * Math.cos(a), centre.y + reach * Math.sin(a), 1.5);
      }
    }
    let k = 0;
    for (const line of this.world.lines) {
      for (const piece of line.pieces) {
        // At the middle of the Piece's middle capsule.
        const { a, b } = piece.segments[Math.floor(piece.segments.length / 2)]!;
        const middle =
          piece.segments.length % 2 === 0 ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.label(k++)
          .setText(`${Math.ceil(piece.durability)}`)
          .setPosition(middle.x, middle.y)
          .setVisible(true);
      }
    }
    for (const object of this.world.objects) {
      for (const part of object.parts) strokePolygon(g, transformPoints(part, object.transform));
      // The impact count, for Colours that break on a number of impacts (blue).
      const limit = this.world.materials.colours[object.colour].outline.impactLimit;
      const impacts = limit > 0 ? ` ×${object.impacts}/${limit}` : '';
      this.label(k++)
        .setText(`${Math.ceil(object.durability)}${impacts}`)
        .setPosition(object.transform.x, object.transform.y)
        .setVisible(true);
    }
    for (; k < this.labels.length; k++) this.labels[k]!.setVisible(false);

    const fps = this.scene.game.loop.actualFps;
    let stats = `fps    ${fps.toFixed(0)}\nbodies ${this.world.bodyCount}`;
    if (frames) {
      const { averageFps: average, longestMs: longest } = frames;
      stats +=
        `\nsince start (${frames.frames} frames)` +
        `\navg fps ${average === null ? '-' : average.toFixed(1)}` +
        `\nlongest ${longest === null ? '-' : `${longest.toFixed(1)} ms`}`;
    }
    this.stats.setText(stats);
  }
}
