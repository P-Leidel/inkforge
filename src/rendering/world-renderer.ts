import type Phaser from 'phaser';
import { bandPolygon } from '../geometry/separation';
import type { Segment } from '../geometry/segment';
import { applyTransform, between, carry, type Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import { Random } from '../sandbox/random';
import {
  GRAVITY,
  STEP_SECONDS,
  type Entry,
  type LineView,
  type ObjectView,
  type PieceView,
  type Poses,
  type Reader,
  type SandboxWorld,
  type StrokeId,
  type Thing,
} from '../sandbox/sandbox-world';
import { COLOURS, type Colour } from '../materials/colour';
import { BakedDrawing, BakedTextures, bakingGraphics } from './baked-textures';
import { Debris } from './debris';
import { fillPolygon, strokePolygon, strokePolyline } from './draw';
import { drawInk, fillInk, hash, INK_HUES, inkReach, segmentRuns } from './ink';
import { PALETTE } from './palette';
import { rectAround, tilesAlong } from './tiles';

/** Width an Outline is drawn with, centred on the Object's edge. */
const OUTLINE_WIDTH = 5;

type Graphics = Phaser.GameObjects.Graphics;
type Image = Phaser.GameObjects.Image;

/** Wear at which each of the three crack stages shows. */
const CRACK_STAGES = [0.25, 0.5, 0.75];
const CRACK_WIDTH = 2;
const DEBRIS_DEPTH = 5;
/** Seed of the Debris' own random generator, apart from the simulation's. */
const DEBRIS_SEED = 0x0deb415;
/** Blast rings show over everything else in the Arena. */
const BLAST_DEPTH = 6;
/** Width of a Blast's ring at full strength, and as it dies out. */
const BLAST_RING_WIDTH = 10;
const BLAST_RING_MIN_WIDTH = 2;
/** The hot flash inside a fresh Blast ring. */
const BLAST_FLASH = 0xffc15a;
/** Bond blobs show over the Objects they hold. */
const BOND_DEPTH = 4;
/** Patches show over what they lie on, and Droplets over them. */
const PATCH_DEPTH = 3;
/** A Patch is drawn a little wider than it is thick, so it reads on its host's edge. */
const PATCH_EXTRA_WIDTH = 2.5;
/** A used-up Patch has faded to this opacity. */
const PATCH_WORN_ALPHA = 0.35;
/** Radius of the blob of glue drawn where a bond holds. */
const BOND_RADIUS = 5;
/** Sides of the polygon a piece of Rubble is drawn as. */
const RUBBLE_SIDES = 20;
/** Width of the rim around a piece of Rubble. */
const RUBBLE_RIM = 2;
/** Seconds Rubble removed by the cap takes to fade out. */
const RUBBLE_FADE_SECONDS = 0.5;
/** Lines are baked in tiles of at most this many px square. */
const LINE_TILE = 256;
/** How far a Frozen Object's pin reaches from its centre, px. */
const PIN_REACH = 10;

/** A Line as drawn: its tiles, once baked, and what it was last baked with. */
interface DrawnLine {
  tiles: BakedDrawing[] | null;
  /** The places along the Line of its Pieces still there. */
  readonly pieces: Set<number>;
  /** Each Piece's crack stage, in order along the Line, as last baked. */
  stages: readonly number[];
  /** Whether a Piece came or went since it was last baked. */
  stale: boolean;
}

/** An Object as drawn: its texture, once baked, and what it was last baked with. */
interface DrawnObject {
  drawing: BakedDrawing | null;
  frozen: boolean;
  stage: number;
  /** Whether its Fill changed, or it was Released, since it was last baked. */
  stale: boolean;
}

/** Rubble the cap removed, fading out where it was. */
interface FadingRubble {
  readonly image: Image;
  /** The simulated time the cap removed it, s. */
  readonly since: number;
}

/** The ids of what the renderer holds a drawing for. */
export interface Held {
  readonly lines: readonly StrokeId[];
  readonly objects: readonly StrokeId[];
  readonly rubble: readonly number[];
  readonly patches: readonly number[];
}

/**
 * Draws the Sandbox world's state: Terrain, Lines, Objects, Rubble, Patches,
 * Droplets, bonds, Debris and Blast rings.
 *
 * What it holds a drawing for comes and goes only by the world's list of
 * what happened, which it reads once a frame: it makes a drawing on
 * `added`, bakes again on a Fill or a Release, frees it on `went` and
 * drops everything on `start over`. Poses, wear and the Frozen state it
 * still reads from the views each frame. What is visual only is its own,
 * drawn from the list: Debris bursts where something broke and where a
 * Patch went used up or capped, and Rubble the cap removed fades out.
 *
 * Each Stroke is baked into textures of its own, and baked again only when
 * its look changes (a crack, a break, a Fill): a Line in tiles, so a long
 * diagonal one doesn't need a texture the size of the screen, and an Object
 * in one texture that moves and turns with it. Patches and Rubble are Images
 * of looks baked once and shared by every Patch or piece of Rubble that looks
 * the same; a Patch fades as it wears. Droplets, bonds, Debris and Blast rings
 * are redrawn every frame.
 *
 * The world steps at a fixed rate, and a screen can show more frames than
 * that: each Object, piece of Rubble and Droplet is drawn between its pose
 * as the latest step began and its pose now, as far as the world is into
 * its next step, so it moves smoothly. Patches and bonds are drawn where
 * their hosts are drawn. Debris and Blast rings keep to the steps.
 */
export class WorldRenderer {
  private readonly happenings: Reader;
  /** Each Line by its id. */
  private readonly lines = new Map<StrokeId, DrawnLine>();
  private readonly objects = new Map<StrokeId, DrawnObject>();
  /** Each piece of Rubble by its id. */
  private readonly rubble = new Map<number, Image>();
  /** Rubble the cap removed, oldest first. */
  private fading: FadingRubble[] = [];
  /** The looks of Rubble, by Colour and radius, and of Patches, by Colour and size. */
  private readonly baked: BakedTextures;
  /** Each Patch by its id. */
  private readonly patches = new Map<number, Image>();
  private readonly debris = new Debris(new Random(DEBRIS_SEED), GRAVITY, STEP_SECONDS);
  /** The simulated time the Debris has moved on to, s. */
  private debrisTime: number;
  private readonly droplets: Graphics;
  private readonly debrisGraphics: Graphics;
  private readonly bonds: Graphics;
  private readonly blasts: Graphics;

  /**
   * Draws `world`, which must hold no Strokes, Rubble or Patches yet: from
   * here on it knows what is there only by what happens.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    const { lines, objects, rubble, patches } = world;
    if (lines.length + objects.length + rubble.length + patches.length > 0)
      throw new Error('a World renderer starts on a world with nothing in it');
    this.happenings = world.happenings.reader();
    this.debrisTime = world.time;
    this.baked = new BakedTextures(scene);
    // Rubble in each Colour's usual size, before the first Fill breaks.
    for (const colour of COLOURS) {
      const { rubbleMax, rubbleRadius } = world.materials.colours[colour].fill;
      if (rubbleMax >= 1 && rubbleRadius > 0)
        this.baked.prepare(...rubbleLook(colour, rubbleRadius));
    }
    this.drawTerrain(scene.add.graphics());
    this.debrisGraphics = scene.add.graphics().setDepth(DEBRIS_DEPTH);
    this.bonds = scene.add.graphics().setDepth(BOND_DEPTH);
    this.droplets = scene.add.graphics().setDepth(PATCH_DEPTH);
    this.blasts = scene.add.graphics().setDepth(BLAST_DEPTH);
  }

  /** Frees the textures, and stops reading what happens. */
  destroy(): void {
    this.happenings.close();
    this.dropAll();
    this.baked.destroy();
  }

  /** Debris particles in flight. */
  get debrisCount(): number {
    return this.debris.count;
  }

  /** The ids of what it holds a drawing for, for tests. */
  held(): Held {
    return {
      lines: [...this.lines.keys()],
      objects: [...this.objects.keys()],
      rubble: [...this.rubble.keys()],
      patches: [...this.patches.keys()],
    };
  }

  /** Draws `draw` once and bakes it into each of `drawings`. */
  private bake(drawings: readonly BakedDrawing[], draw: (g: Graphics) => void): void {
    const g = bakingGraphics(this.scene);
    draw(g);
    for (const drawing of drawings) drawing.bake(g);
    g.destroy();
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
    const now = this.world.time;
    this.debris.advance(Math.round((now - this.debrisTime) / STEP_SECONDS));
    this.debrisTime = now;
    for (const entry of this.happenings.read()) this.follow(entry, now);
    const fraction = this.world.stepFraction;
    this.drawLines();
    this.drawObjects(fraction);
    this.placeRubble(fraction, now);
    this.placePatches(fraction);
    this.drawDroplets(fraction);
    this.drawBonds(fraction);
    this.drawDebris();
    this.drawBlasts();
  }

  /** Makes, bakes again or frees what one entry of the list says; `now` is the world's time. */
  private follow(entry: Entry, now: number): void {
    switch (entry.kind) {
      case 'added':
        this.add(entry.what);
        return;
      case 'went': {
        const { what, why, transform, velocity } = entry;
        if (what.thing === 'rubble' && why === 'capped') this.fade(what.id, transform, entry.time);
        else this.free(what);
        if (what.thing === 'patch' && (why === 'capped' || why === 'used-up')) {
          // A puff of Debris where the Patch was.
          const segment = {
            a: applyTransform(what.segment.a, transform),
            b: applyTransform(what.segment.b, transform),
          };
          const band = bandPolygon([segment], what.thickness / 2 + 1);
          this.debris.burst(band, velocity, [what.colour], this.stepsSince(entry.time, now));
        }
        return;
      }
      case 'filled':
      case 'released': {
        const object = this.objects.get(entry.id);
        if (object) object.stale = true;
        return;
      }
      case 'burst':
        this.debris.burst(
          entry.outline,
          entry.velocity,
          entry.colours,
          this.stepsSince(entry.time, now),
        );
        return;
      case 'exploded':
        return;
      case 'start-over':
        this.dropAll();
        return;
    }
  }

  /** Whole steps from `time` to `now`. */
  private stepsSince(time: number, now: number): number {
    return Math.max(0, Math.round((now - time) / STEP_SECONDS));
  }

  /** Makes a drawing for what was added; Lines and Objects are baked when next drawn. */
  private add(what: Thing): void {
    switch (what.thing) {
      case 'piece': {
        let line = this.lines.get(what.id);
        if (!line) {
          line = { tiles: null, pieces: new Set(), stages: [], stale: true };
          this.lines.set(what.id, line);
        }
        line.pieces.add(what.index);
        line.stale = true;
        return;
      }
      case 'object':
        this.objects.set(what.id, { drawing: null, frozen: true, stage: 0, stale: true });
        return;
      case 'rubble':
        this.rubble.set(what.id, this.baked.image(...rubbleLook(what.colour, what.radius)));
        return;
      case 'patch':
        this.patches.set(what.id, this.baked.image(...patchLook(what)).setDepth(PATCH_DEPTH));
        return;
      case 'droplet':
        return; // drawn afresh every frame
    }
  }

  /** Frees the drawing of what went. A Line goes with its last Piece. */
  private free(what: Thing): void {
    switch (what.thing) {
      case 'piece': {
        const line = this.lines.get(what.id);
        if (!line) return;
        line.pieces.delete(what.index);
        line.stale = true;
        if (line.pieces.size > 0) return;
        for (const tile of line.tiles ?? []) tile.destroy();
        this.lines.delete(what.id);
        return;
      }
      case 'object':
        this.objects.get(what.id)?.drawing?.destroy();
        this.objects.delete(what.id);
        return;
      case 'rubble':
        this.rubble.get(what.id)?.destroy();
        this.rubble.delete(what.id);
        return;
      case 'patch':
        this.patches.get(what.id)?.destroy();
        this.patches.delete(what.id);
        return;
      case 'droplet':
        return;
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

  /** Frees every drawing, and drops the Debris and the fading Rubble. */
  private dropAll(): void {
    for (const { tiles } of this.lines.values()) for (const tile of tiles ?? []) tile.destroy();
    for (const { drawing } of this.objects.values()) drawing?.destroy();
    for (const image of [...this.rubble.values(), ...this.patches.values()]) image.destroy();
    for (const { image } of this.fading) image.destroy();
    this.lines.clear();
    this.objects.clear();
    this.rubble.clear();
    this.patches.clear();
    this.fading = [];
    this.debris.clear();
  }

  /**
   * Each Blast as its ring spreading out, fading and thinning as it weakens
   * the way its strength does, (1 − d/R)², around a hot flash that fades
   * faster.
   */
  private drawBlasts(): void {
    const g = this.blasts;
    g.clear();
    for (const { centre, radius, reach } of this.world.blasts) {
      const left = 1 - radius / reach;
      const strength = left * left;
      g.fillStyle(BLAST_FLASH, 0.35 * strength * strength);
      g.fillCircle(centre.x, centre.y, radius);
      const width = BLAST_RING_MIN_WIDTH + (BLAST_RING_WIDTH - BLAST_RING_MIN_WIDTH) * strength;
      g.lineStyle(width, INK_HUES.red, 0.2 + 0.8 * strength);
      g.strokeCircle(centre.x, centre.y, radius);
    }
  }

  /** A blob of green glue where each stuck Object is held, so it's clear why it hangs. */
  private drawBonds(fraction: number): void {
    const g = this.bonds;
    g.clear();
    for (const bond of this.world.bonds) {
      const point = carry(
        bond.point,
        bond.objectPoses.transform,
        drawn(bond.objectPoses, fraction),
      );
      g.fillStyle(INK_HUES.green, 1);
      g.fillCircle(point.x, point.y, BOND_RADIUS);
      g.lineStyle(2, PALETTE.crack, 0.8);
      g.strokeCircle(point.x, point.y, BOND_RADIUS);
    }
  }

  /** Rubble in the place it is, and what the cap removed fading out where it was. */
  private placeRubble(fraction: number, now: number): void {
    for (const piece of this.world.rubble) {
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

  /** Each Patch where its host is now, a strip of its Colour's ink fading as it wears. */
  private placePatches(fraction: number): void {
    for (const patch of this.world.patches) {
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

  /** Each Droplet as a small disc in its Colour, with a glint. */
  private drawDroplets(fraction: number): void {
    const g = this.droplets;
    g.clear();
    for (const droplet of this.world.droplets) {
      const { colour, radius } = droplet;
      const transform = drawn(droplet, fraction);
      g.fillStyle(INK_HUES[colour], 1);
      g.fillCircle(transform.x, transform.y, radius);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(transform.x - radius * 0.35, transform.y - radius * 0.35, radius * 0.35);
    }
  }

  /** Each particle as a small tumbling square in its Colour, fading out. */
  private drawDebris(): void {
    const g = this.debrisGraphics;
    g.clear();
    for (const { colour, size, position, angle, opacity } of this.debris.views) {
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

  /** Bakes each Line again when a Piece came or went, or a Piece's crack stage changed. */
  private drawLines(): void {
    for (const line of this.world.lines) {
      const drawnLine = this.lines.get(line.id);
      if (!drawnLine) continue;
      const stages = line.pieces.map((piece) => crackStage(piece.wear));
      if (!drawnLine.stale && sameStages(drawnLine.stages, stages)) continue;
      // Around the whole Line as it first shows: it only loses Pieces from here on.
      drawnLine.tiles ??= tilesAlong(
        line.segments,
        inkReach(line.colour, line.thickness),
        LINE_TILE,
      ).map((rect) => new BakedDrawing(this.scene, rect));
      this.bake(drawnLine.tiles, (g) => drawLine(g, line));
      drawnLine.stages = stages;
      drawnLine.stale = false;
    }
  }

  /**
   * Bakes each Object again when its Fill changed, it was Released, a hit
   * or a Blast woke it, or its crack stage changed, and places it.
   */
  private drawObjects(fraction: number): void {
    for (const object of this.world.objects) {
      const drawnObject = this.objects.get(object.id);
      if (!drawnObject) continue;
      const stage = crackStage(object.wear);
      if (
        drawnObject.stale ||
        drawnObject.frozen !== object.frozen ||
        drawnObject.stage !== stage
      ) {
        drawnObject.drawing ??= new BakedDrawing(
          this.scene,
          rectAround(
            [...object.outline, { x: -PIN_REACH, y: -PIN_REACH }, { x: PIN_REACH, y: PIN_REACH }],
            inkReach(object.colour, OUTLINE_WIDTH),
          ),
        );
        this.bake([drawnObject.drawing], (g) => drawObject(g, object));
        drawnObject.frozen = object.frozen;
        drawnObject.stage = stage;
        drawnObject.stale = false;
      }
      const { x, y, angle } = drawn(object, fraction);
      drawnObject.drawing!.image.setPosition(x, y).setRotation(angle);
    }
  }
}

function sameStages(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((stage, k) => stage === b[k]);
}

/** Where a body is drawn: `fraction` of the way from its previous pose to its pose now. */
function drawn({ previousTransform, transform }: Poses, fraction: number): Transform {
  return between(previousTransform, transform, fraction);
}

/**
 * Draws what's left of a Line: its Pieces joined where they meet, so a
 * broken Piece leaves a gap, and each Piece's cracks.
 */
function drawLine(g: Graphics, line: LineView): void {
  for (const run of segmentRuns(line.segments)) {
    drawInk(g, line.colour, run, false, line.thickness);
  }
  for (const piece of line.pieces) drawPieceCracks(g, line, piece);
}

/**
 * One jagged crack per stage straight across a Piece, from edge to edge.
 * Placed by the Line's id and the Piece's index, so each Piece cracks the
 * same way every time.
 */
function drawPieceCracks(g: Graphics, line: LineView, piece: PieceView): void {
  const stages = crackStage(piece.wear);
  if (stages === 0) return;
  const half = line.thickness / 2;
  g.lineStyle(CRACK_WIDTH, line.colour === 'black' ? PALETTE.crackOnBlack : PALETTE.crack, 0.9);
  for (let k = 0; k < stages; k++) {
    const seed = line.id * 31 + piece.index * 7 + k * 3;
    // Spread the stages along the Piece, each nudged a little.
    const along = (k + 0.5 + (hash(seed) - 0.5) * 0.6) / CRACK_STAGES.length;
    const { p, t } = pointAlong(piece.segments, along);
    const n = { x: -t.y, y: t.x };
    const points: Vec2[] = [];
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const across = half * (1 - (2 * i) / steps);
      const zig = (i % 2 === 0 ? 1 : -1) * (1 + 1.5 * hash(seed + i + 1));
      points.push({ x: p.x + n.x * across + t.x * zig, y: p.y + n.y * across + t.y * zig });
    }
    strokePolyline(g, points);
  }
}

/** The point `fraction` of the way along connected segments, and the direction there. */
function pointAlong(segments: readonly Segment[], fraction: number): { p: Vec2; t: Vec2 } {
  const lengths = segments.map(({ a, b }) => Math.hypot(b.x - a.x, b.y - a.y));
  let left = fraction * lengths.reduce((sum, l) => sum + l, 0);
  for (let i = 0; i < segments.length; i++) {
    const { a, b } = segments[i]!;
    const length = lengths[i]!;
    if (left <= length || i === segments.length - 1) {
      const u = length > 0 ? Math.min(1, left / length) : 0;
      const t = length > 0 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
      return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, t };
    }
    left -= length;
  }
  return { p: segments[0]!.a, t: { x: 1, y: 0 } };
}

/**
 * Draws an Object in its own coordinates: its Outline in its Colour around
 * its Fill, or around a faintly tinted, hollow inside. A Frozen one is pinned.
 */
function drawObject(g: Graphics, object: ObjectView): void {
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

/** How many crack stages a Piece's or an Object's wear shows: 0 to 3. */
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
