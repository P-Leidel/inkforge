import type Phaser from 'phaser';
import type { Segment } from '../../geometry/segment';
import type { Vec2 } from '../../geometry/vec2';
import type { Entry, LineView, PieceView, StrokeId } from '../../sandbox/sandbox-world';
import { BakedDrawing, bakeInto } from '../baked-textures';
import { strokePolyline } from '../draw';
import { drawInk, hash, inkReach, segmentRuns } from '../ink';
import { PALETTE } from '../palette';
import { tilesAlong } from '../tiles';
import { CRACK_STAGES, CRACK_WIDTH, crackStage } from './cracks';
import type { DrawnKind } from './drawn-kind';

type Graphics = Phaser.GameObjects.Graphics;

/** Lines are baked in tiles of at most this many px square. */
const LINE_TILE = 256;

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

/**
 * The Lines, each baked in tiles of its own, so a long diagonal one doesn't
 * need a texture the size of the screen. A Line is made with its first
 * Piece, baked again when a Piece comes or goes or a Piece's crack stage
 * changes, and freed with its last Piece.
 */
export class LinesDrawing implements DrawnKind {
  /** Each Line by its id. */
  private readonly lines = new Map<StrokeId, DrawnLine>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly views: () => readonly LineView[],
  ) {}

  /** The ids of the Lines it holds a drawing for. */
  held(): StrokeId[] {
    return [...this.lines.keys()];
  }

  follow(entry: Entry): void {
    if (entry.kind === 'added' && entry.what.thing === 'piece') this.add(entry.what);
    else if (entry.kind === 'went' && entry.what.thing === 'piece') this.free(entry.what);
  }

  /** A Piece came: its Line is baked when next drawn. */
  private add({ id, index }: { id: StrokeId; index: number }): void {
    let line = this.lines.get(id);
    if (!line) {
      line = { tiles: null, pieces: new Set(), stages: [], stale: true };
      this.lines.set(id, line);
    }
    line.pieces.add(index);
    line.stale = true;
  }

  /** A Piece went. A Line goes with its last Piece. */
  private free({ id, index }: { id: StrokeId; index: number }): void {
    const line = this.lines.get(id);
    if (!line) return;
    line.pieces.delete(index);
    line.stale = true;
    if (line.pieces.size > 0) return;
    for (const tile of line.tiles ?? []) tile.destroy();
    this.lines.delete(id);
  }

  dropAll(): void {
    for (const { tiles } of this.lines.values()) for (const tile of tiles ?? []) tile.destroy();
    this.lines.clear();
  }

  /** Bakes each Line again when a Piece came or went, or a Piece's crack stage changed. */
  draw(): void {
    for (const line of this.views()) {
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
      bakeInto(this.scene, drawnLine.tiles, (g) => drawLine(g, line));
      drawnLine.stages = stages;
      drawnLine.stale = false;
    }
  }
}

function sameStages(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((stage, k) => stage === b[k]);
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
