import type Phaser from 'phaser';
import type { Polygon } from '../../geometry/polygon';
import type { Segment } from '../../geometry/segment';
import { bandPolygon } from '../../geometry/separation';
import { applyTransform, carry } from '../../geometry/transform';
import type { Vec2 } from '../../geometry/vec2';
import type { Colour } from '../../materials/colour';
import type { Entry, PatchView } from '../../sandbox/sandbox-world';
import type { BakedTextures } from '../baked-textures';
import { drawInk, inkReach } from '../ink';
import { drawn, type DrawnKind } from './drawn-kind';

type Graphics = Phaser.GameObjects.Graphics;
type Image = Phaser.GameObjects.Image;

/** Patches show over what they lie on, and Droplets over them. */
export const PATCH_DEPTH = 3;
/** A Patch is drawn a little wider than it is thick, so it reads on its host's edge. */
const PATCH_EXTRA_WIDTH = 2.5;
/** A used-up Patch has faded to this opacity. */
const PATCH_WORN_ALPHA = 0.35;

/** Bursts Debris from `outline`, as it was at simulated time `time`. */
export type Puff = (
  outline: Polygon,
  velocity: Vec2,
  colours: readonly Colour[],
  time: number,
) => void;

/**
 * The Patches: Images of looks baked once and shared by every Patch that
 * looks the same, drawn where their hosts are drawn and fading as they
 * wear. A Patch used up or capped goes in a puff of Debris.
 */
export class PatchesDrawing implements DrawnKind {
  /** Each Patch by its id. */
  private readonly patches = new Map<number, Image>();

  constructor(
    private readonly baked: BakedTextures,
    private readonly views: () => readonly PatchView[],
    private readonly puff: Puff,
  ) {}

  /** The ids of the Patches it holds a drawing for. */
  held(): number[] {
    return [...this.patches.keys()];
  }

  follow(entry: Entry): void {
    if (entry.kind === 'added' && entry.what.thing === 'patch') {
      this.patches.set(
        entry.what.id,
        this.baked.image(...patchLook(entry.what)).setDepth(PATCH_DEPTH),
      );
    } else if (entry.kind === 'went' && entry.what.thing === 'patch') {
      const { what, why, transform, velocity } = entry;
      this.patches.get(what.id)?.destroy();
      this.patches.delete(what.id);
      if (why === 'capped' || why === 'used-up') {
        // A puff of Debris where the Patch was.
        const segment = {
          a: applyTransform(what.segment.a, transform),
          b: applyTransform(what.segment.b, transform),
        };
        const band = bandPolygon([segment], what.thickness / 2 + 1);
        this.puff(band, velocity, [what.colour], entry.time);
      }
    }
  }

  dropAll(): void {
    for (const image of this.patches.values()) image.destroy();
    this.patches.clear();
  }

  /** Each Patch where its host is now, a strip of its Colour's ink fading as it wears. */
  draw(fraction: number): void {
    for (const patch of this.views()) {
      const image = this.patches.get(patch.id);
      if (!image) continue;
      const host = patch.hostPoses.transform;
      const hostDrawn = drawn(patch.hostPoses, fraction);
      const a = carry(patch.segment.a, host, hostDrawn);
      const b = carry(patch.segment.b, host, hostDrawn);
      image
        .setPosition((a.x + b.x) / 2, (a.y + b.y) / 2)
        .setRotation(Math.atan2(b.y - a.y, b.x - a.x))
        .setAlpha(1 - (1 - PATCH_WORN_ALPHA) * patch.wear);
    }
  }
}

/**
 * A Patch's look, to bake: Patches of a Colour, length and thickness look the
 * same. Rounded to whole px of length and half px of thickness, so a few
 * looks serve every Patch.
 */
function patchLook(patch: {
  readonly colour: Colour;
  readonly segment: Segment;
  readonly thickness: number;
}): [string, number, (g: Graphics) => void] {
  const { a, b } = patch.segment;
  const length = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const width = Math.round(2 * patch.thickness) / 2 + PATCH_EXTRA_WIDTH;
  return [
    `patch:${patch.colour}:${length}:${width}`,
    length / 2 + inkReach(patch.colour, width),
    (g) => drawPatch(g, patch.colour, length, width),
  ];
}

/** A Patch in its own coordinates: a strip of its Colour's ink along x, centred on the origin. */
function drawPatch(g: Graphics, colour: Colour, length: number, width: number): void {
  drawInk(
    g,
    colour,
    [
      { x: -length / 2, y: 0 },
      { x: length / 2, y: 0 },
    ],
    false,
    width,
  );
}
