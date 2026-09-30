import type Phaser from 'phaser';
import type { CoreZone, Phase } from '../game/game';
import { PALETTE } from './palette';

/** How the Core Zone looks: faint in the Build Phase, clear during a Wave. */
const LOOKS: Readonly<Record<Phase, { fill: number; edge: number; width: number }>> = {
  build: { fill: 0.03, edge: 0.25, width: 2 },
  wave: { fill: 0.08, edge: 0.7, width: 3 },
};

/**
 * The Core Zone: a circle around the Ink Core, drawn faintly in the Build
 * Phase and clearly during a Wave; not at all with Waves off. Made before
 * the World renderer, so the Terrain and everything in the Arena draw over it.
 */
export class CoreZoneDrawing {
  private readonly graphics: Phaser.GameObjects.Graphics;
  /** What it last drew, so it is redrawn only on a change. */
  private drawn: readonly unknown[] = [];

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  draw(zone: CoreZone, phase: Phase | null): void {
    const { centre, radius } = zone;
    const now = [phase, centre.x, centre.y, radius];
    if (now.every((v, k) => v === this.drawn[k])) return;
    this.drawn = now;
    const g = this.graphics;
    g.clear();
    if (!phase || radius <= 0) return;
    const look = LOOKS[phase];
    g.fillStyle(PALETTE.coreZone, look.fill);
    g.fillCircle(centre.x, centre.y, radius);
    g.lineStyle(look.width, PALETTE.coreZone, look.edge);
    g.strokeCircle(centre.x, centre.y, radius);
  }
}
