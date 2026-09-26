import type Phaser from 'phaser';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import type {
  FadingRubbleView,
  LineView,
  ObjectView,
  PatchView,
  PieceView,
  SandboxWorld,
  StrokeId,
} from '../sandbox/sandbox-world';
import { fillPolygon, strokePolygon, strokePolyline } from './draw';
import { drawInk, fillInk, hash, INK_HUES, segmentRuns } from './ink';
import { PALETTE } from './palette';

/** Width an Outline is drawn with, centred on the Object's edge. */
const OUTLINE_WIDTH = 5;

type Graphics = Phaser.GameObjects.Graphics;

/** Wear at which each of the three crack stages shows. */
const CRACK_STAGES = [0.25, 0.5, 0.75];
const CRACK_WIDTH = 2;
const DEBRIS_DEPTH = 5;
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

/**
 * Draws the Sandbox world's state: Terrain, Lines, Objects, Rubble, Patches,
 * Droplets, bonds, Debris and Blast rings. Each Stroke gets its own Graphics, drawn again
 * only when its look changes; moving Objects only update its transform. So
 * does each piece of Rubble and each Patch, which never change their look;
 * a Patch fades as it wears. Droplets, bonds, Debris and Blast rings are
 * redrawn every frame.
 */
export class WorldRenderer {
  private readonly lines = new Map<StrokeId, Graphics>();
  private readonly objects = new Map<StrokeId, Graphics>();
  /** The Pieces and cracks each Line was last drawn with. */
  private readonly drawnLineLook = new Map<StrokeId, string>();
  /** The Frozen state and Fill each Object was last drawn with. */
  private readonly drawnLook = new Map<StrokeId, string>();
  /** Each piece of Rubble, live or fading out, by its id. */
  private readonly rubble = new Map<number, Graphics>();
  /** Each Patch by its id. */
  private readonly patches = new Map<number, Graphics>();
  private readonly droplets: Graphics;
  private readonly debris: Graphics;
  private readonly bonds: Graphics;
  private readonly blasts: Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.drawTerrain(scene.add.graphics());
    this.debris = scene.add.graphics().setDepth(DEBRIS_DEPTH);
    this.bonds = scene.add.graphics().setDepth(BOND_DEPTH);
    this.droplets = scene.add.graphics().setDepth(PATCH_DEPTH);
    this.blasts = scene.add.graphics().setDepth(BLAST_DEPTH);
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
    this.syncRubble();
    this.syncPatches();
    this.drawDroplets();
    this.drawBonds();
    this.drawDebris();
    this.drawBlasts();
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
  private drawBonds(): void {
    const g = this.bonds;
    g.clear();
    for (const { point } of this.world.bonds) {
      g.fillStyle(INK_HUES.green, 1);
      g.fillCircle(point.x, point.y, BOND_RADIUS);
      g.lineStyle(2, PALETTE.crack, 0.8);
      g.strokeCircle(point.x, point.y, BOND_RADIUS);
    }
  }

  /** Rubble in the place it is, and what the cap removed fading out where it was. */
  private syncRubble(): void {
    const current = new Set<number>();
    const pieces: FadingRubbleView[] = [
      ...this.world.rubble.map((piece) => ({ ...piece, opacity: 1 })),
      ...this.world.fadingRubble,
    ];
    for (const piece of pieces) {
      current.add(piece.id);
      let g = this.rubble.get(piece.id);
      if (!g) {
        g = this.scene.add.graphics();
        drawRubble(g, piece);
        this.rubble.set(piece.id, g);
      }
      const { x, y, angle } = piece.transform;
      g.setPosition(x, y).setRotation(angle).setAlpha(piece.opacity);
    }
    removeStale(this.rubble, current);
  }

  /** Each Patch where its host is now, a strip of its Colour's ink fading as it wears. */
  private syncPatches(): void {
    const current = new Set<number>();
    for (const patch of this.world.patches) {
      current.add(patch.id);
      let g = this.patches.get(patch.id);
      if (!g) {
        g = this.scene.add.graphics().setDepth(PATCH_DEPTH);
        drawPatch(g, patch);
        this.patches.set(patch.id, g);
      }
      const { a, b } = patch.segment;
      g.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2)
        .setRotation(Math.atan2(b.y - a.y, b.x - a.x))
        .setAlpha(1 - (1 - PATCH_WORN_ALPHA) * patch.wear);
    }
    removeStale(this.patches, current);
  }

  /** Each Droplet as a small disc in its Colour, with a glint. */
  private drawDroplets(): void {
    const g = this.droplets;
    g.clear();
    for (const { colour, radius, transform } of this.world.droplets) {
      g.fillStyle(INK_HUES[colour], 1);
      g.fillCircle(transform.x, transform.y, radius);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(transform.x - radius * 0.35, transform.y - radius * 0.35, radius * 0.35);
    }
  }

  /** Each particle as a small tumbling square in its Colour, fading out. */
  private drawDebris(): void {
    const g = this.debris;
    g.clear();
    for (const { colour, size, position, angle, opacity } of this.world.debrisParticles) {
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

  private syncLines(): void {
    const current = new Set<StrokeId>();
    for (const line of this.world.lines) {
      current.add(line.id);
      let g = this.lines.get(line.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.lines.set(line.id, g);
      }
      const look = line.pieces.map((p) => `${p.index}:${crackStage(p.wear)}`).join(' ');
      if (this.drawnLineLook.get(line.id) !== look) {
        drawLine(g, line);
        this.drawnLineLook.set(line.id, look);
      }
    }
    removeStale(this.lines, current);
    for (const id of this.drawnLineLook.keys()) if (!current.has(id)) this.drawnLineLook.delete(id);
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
      const look = `${object.frozen} ${object.fill} ${crackStage(object.wear)}`;
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
 * Draws what's left of a Line: its Pieces joined where they meet, so a
 * broken Piece leaves a gap, and each Piece's cracks.
 */
function drawLine(g: Graphics, line: LineView): void {
  g.clear();
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
  g.clear();
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

/** A piece of Rubble in its own coordinates: a disc of its Fill Colour's ink, with a rim. */
function drawRubble(g: Graphics, piece: FadingRubbleView): void {
  const disc = Array.from({ length: RUBBLE_SIDES }, (_, k) => {
    const angle = (2 * Math.PI * k) / RUBBLE_SIDES;
    const r = piece.radius - RUBBLE_RIM / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
  fillInk(g, piece.colour, disc);
  drawInk(g, piece.colour, disc, true, RUBBLE_RIM);
}

/** A Patch in its own coordinates: a strip of its Colour's ink along x, centred on the origin. */
function drawPatch(g: Graphics, patch: PatchView): void {
  const { a, b } = patch.segment;
  const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  drawInk(
    g,
    patch.colour,
    [
      { x: -half, y: 0 },
      { x: half, y: 0 },
    ],
    false,
    patch.thickness + PATCH_EXTRA_WIDTH,
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

function removeStale(graphics: Map<number, Graphics>, current: Set<number>): void {
  for (const [id, g] of graphics) {
    if (current.has(id)) continue;
    g.destroy();
    graphics.delete(id);
  }
}
