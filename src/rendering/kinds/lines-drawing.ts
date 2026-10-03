import type Phaser from 'phaser';
import type { Segment } from '../../geometry/segment';
import type { Vec2 } from '../../geometry/vec2';
import type { Entry, LineView, PieceView, RunView, StrokeId } from '../../sandbox/sandbox-world';
import { BakedDrawing, bakeInto } from '../baked-textures';
import { strokePolyline } from '../draw';
import { drawInk, hash, inkReach, segmentRuns } from '../ink';
import { PALETTE } from '../palette';
import { drawPin, PIN_REACH } from '../pin';
import { tilesAlong } from '../tiles';
import { CRACK_STAGES, CRACK_WIDTH, crackStage } from './cracks';
import { drawn, type DrawnKind } from './drawn-kind';

type Graphics = Phaser.GameObjects.Graphics;

/** Lines are baked in tiles of at most this many px square. */
const LINE_TILE = 256;

/** A Run's tiles, and the places along the Line of the Pieces it had when they were made. */
interface BakedRun {
  readonly pieces: ReadonlySet<number>;
  readonly tiles: readonly BakedDrawing[];
}

/** A Line as drawn: each Run's tiles, once baked, and what they were last baked with. */
interface DrawnLine {
  /** Each Run's tiles, in order along the Line as they were made; null until baked. */
  runs: BakedRun[] | null;
  /** The places along the Line of its Pieces still there. */
  readonly pieces: Set<number>;
  /** Each Piece's crack stage, in order along the Line, as last baked. */
  stages: readonly number[];
  /** Whether each Run was baked Frozen, with its pin. */
  frozen: readonly boolean[];
  /** Whether a Piece came or went, or it was Released, since it was last baked. */
  stale: boolean;
}

/**
 * The Lines, each Run of each baked in tiles of its own, so a long diagonal
 * one doesn't need a texture the size of the screen. A Line is made with its
 * first Piece, baked again when a Piece comes or goes, a Piece's crack stage
 * changes or a Run is Released or Frozen, made again when it changes form
 * (`reformed`) or loses a Run, and freed with its last Piece. A Run that
 * isn't Grounded is baked in its own coordinates, and its tiles move and
 * turn with it; a Frozen one is pinned halfway along.
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
    else if (entry.kind === 'released') {
      const line = this.lines.get(entry.id);
      if (line) line.stale = true;
    } else if (entry.kind === 'reformed') this.reform(entry.id);
  }

  /**
   * A Line changed form: its Runs' tiles are made again where they are now,
   * a Grounded one's in the world's coordinates, one that isn't in its own.
   */
  private reform(id: StrokeId): void {
    const line = this.lines.get(id);
    if (line) unbake(line);
  }

  /** A Piece came: its Line is baked when next drawn. */
  private add({ id, index }: { id: StrokeId; index: number }): void {
    let line = this.lines.get(id);
    if (!line) {
      line = { runs: null, pieces: new Set(), stages: [], frozen: [], stale: true };
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
    unbake(line);
    this.lines.delete(id);
  }

  dropAll(): void {
    for (const line of this.lines.values()) unbake(line);
    this.lines.clear();
  }

  /**
   * Bakes each Line again when a Piece came or went, a Piece's crack stage
   * changed or a Run was Released or Frozen, and places its moving Runs.
   */
  draw(fraction: number): void {
    for (const line of this.views()) {
      const drawnLine = this.lines.get(line.id);
      if (!drawnLine) continue;
      let tiles = drawnLine.runs && tilesOf(drawnLine.runs, line.runs);
      if (drawnLine.runs && !tiles) unbake(drawnLine);
      const stages = line.runs.flatMap((run) => run.pieces.map((piece) => crackStage(piece.wear)));
      const frozen = line.runs.map((run) => run.frozen);
      const stale =
        drawnLine.stale || !same(drawnLine.frozen, frozen) || !same(drawnLine.stages, stages);
      if (stale) {
        // Around each whole Run as it first shows, and its pin: it only loses Pieces from here on.
        const reach = Math.max(inkReach(line.colour, line.thickness), PIN_REACH);
        drawnLine.runs ??= line.runs.map((run) => ({
          pieces: new Set(run.pieces.map((piece) => piece.index)),
          tiles: tilesAlong(run.segments, reach, LINE_TILE).map(
            (rect) => new BakedDrawing(this.scene, rect),
          ),
        }));
        tiles ??= drawnLine.runs.map((run) => run.tiles);
        line.runs.forEach((run, k) =>
          bakeInto(this.scene, tiles![k]!, (g) => drawRun(g, line, run)),
        );
        drawnLine.stages = stages;
        drawnLine.frozen = frozen;
        drawnLine.stale = false;
      }
      line.runs.forEach((run, k) => {
        if (run.grounded) return;
        const { x, y, angle } = drawn(run, fraction);
        for (const tile of tiles![k]!) tile.image.setPosition(x, y).setRotation(angle);
      });
    }
  }
}

/**
 * Each of `runs`' tiles, in their order: a Run only loses Pieces, so its
 * tiles are those made with its first Piece left, wherever the Runs are in
 * order now. Null when a Run lost its last Piece, or has none made.
 */
function tilesOf(
  baked: readonly BakedRun[],
  runs: readonly RunView[],
): (readonly BakedDrawing[])[] | null {
  if (baked.length !== runs.length) return null;
  const tiles = runs.map((run) => baked.find((b) => b.pieces.has(run.pieces[0]!.index))?.tiles);
  return tiles.every((t) => t !== undefined) ? tiles : null;
}

/** Frees a Line's tiles, to be made again when it is next drawn. */
function unbake(line: DrawnLine): void {
  for (const { tiles } of line.runs ?? []) for (const tile of tiles) tile.destroy();
  line.runs = null;
  line.stale = true;
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, k) => value === b[k]);
}

/**
 * Draws what's left of a Run of a Line: its Pieces joined where they meet,
 * so a broken Piece leaves a gap, and each Piece's cracks.
 */
function drawRun(g: Graphics, line: LineView, run: RunView): void {
  for (const joined of segmentRuns(run.segments)) {
    drawInk(g, line.colour, joined, false, line.thickness);
  }
  for (const piece of run.pieces) drawPieceCracks(g, line, piece);
  if (run.frozen) drawPin(g, pointAlong(run.segments, 0.5).p);
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
