import type Phaser from 'phaser';
import type { Transform } from '../../geometry/transform';
import { COLOURS, type Colour } from '../../materials/colour';
import type { MaterialTable } from '../../materials/material-table';
import type { Entry, RubbleView } from '../../sandbox/sandbox-world';
import type { BakedTextures } from '../baked-textures';
import { drawInk, fillInk } from '../ink';
import { drawn, type DrawnKind } from './drawn-kind';

type Graphics = Phaser.GameObjects.Graphics;
type Image = Phaser.GameObjects.Image;

/** Sides of the polygon a piece of Rubble is drawn as. */
const RUBBLE_SIDES = 20;
/** Width of the rim around a piece of Rubble. */
const RUBBLE_RIM = 2;
/** Seconds Rubble removed by the cap takes to fade out. */
const RUBBLE_FADE_SECONDS = 0.5;

/** Rubble the cap removed, fading out where it was. */
interface FadingRubble {
  readonly image: Image;
  /** The simulated time the cap removed it, s. */
  readonly since: number;
}

/**
 * The Rubble: Images of looks baked once and shared by every piece of a
 * Colour and radius. Rubble the cap removed fades out where it was, which
 * is visual only and its own.
 */
export class RubbleDrawing implements DrawnKind {
  /** Each piece of Rubble by its id. */
  private readonly rubble = new Map<number, Image>();
  /** Rubble the cap removed, oldest first. */
  private fading: FadingRubble[] = [];

  /** Bakes Rubble in each Colour's usual size, before the first Fill breaks. */
  constructor(
    private readonly baked: BakedTextures,
    materials: MaterialTable,
    private readonly views: () => readonly RubbleView[],
  ) {
    for (const colour of COLOURS) {
      const { rubbleMax, rubbleRadius } = materials.colours[colour].fill;
      if (rubbleMax >= 1 && rubbleRadius > 0) baked.prepare(...rubbleLook(colour, rubbleRadius));
    }
  }

  /** The ids of the Rubble it holds a drawing for. */
  held(): number[] {
    return [...this.rubble.keys()];
  }

  follow(entry: Entry): void {
    if (entry.kind === 'added' && entry.what.thing === 'rubble') {
      const { id, colour, radius } = entry.what;
      this.rubble.set(id, this.baked.image(...rubbleLook(colour, radius)));
    } else if (entry.kind === 'went' && entry.what.thing === 'rubble') {
      if (entry.why === 'capped') this.fade(entry.what.id, entry.transform, entry.time);
      else {
        this.rubble.get(entry.what.id)?.destroy();
        this.rubble.delete(entry.what.id);
      }
    }
  }

  /** Keeps the image of Rubble the cap removed where it was, to fade out. */
  private fade(id: number, { x, y, angle }: Transform, since: number): void {
    const image = this.rubble.get(id);
    if (!image) return;
    this.rubble.delete(id);
    image.setPosition(x, y).setRotation(angle).setAlpha(1);
    this.fading.push({ image, since });
  }

  /** Frees every piece's image, and drops the fading Rubble. */
  dropAll(): void {
    for (const image of this.rubble.values()) image.destroy();
    for (const { image } of this.fading) image.destroy();
    this.rubble.clear();
    this.fading = [];
  }

  /** Rubble in the place it is, and what the cap removed fading out where it was. */
  draw(fraction: number, now: number): void {
    for (const piece of this.views()) {
      const { x, y, angle } = drawn(piece, fraction);
      this.rubble.get(piece.id)?.setPosition(x, y).setRotation(angle);
    }
    if (this.fading.length === 0) return;
    this.fading = this.fading.filter(({ image, since }) => {
      const age = now - since;
      if (age < RUBBLE_FADE_SECONDS) {
        image.setAlpha(1 - age / RUBBLE_FADE_SECONDS);
        return true;
      }
      image.destroy();
      return false;
    });
  }
}

/** Rubble's look, to bake: every piece of a Colour and size looks the same. */
function rubbleLook(colour: Colour, radius: number): [string, number, (g: Graphics) => void] {
  return [`rubble:${colour}:${radius}`, radius, (g) => drawRubble(g, colour, radius)];
}

/** A piece of Rubble in its own coordinates: a disc of its Fill Colour's ink, with a rim. */
function drawRubble(g: Graphics, colour: Colour, radius: number): void {
  const disc = Array.from({ length: RUBBLE_SIDES }, (_, k) => {
    const angle = (2 * Math.PI * k) / RUBBLE_SIDES;
    const r = radius - RUBBLE_RIM / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
  fillInk(g, colour, disc);
  drawInk(g, colour, disc, true, RUBBLE_RIM);
}
