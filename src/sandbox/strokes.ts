import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import type { ArenaQuery } from './arena-query';
import type { Happening, Why } from './happenings';
import type { Lines } from './lines';
import type { Broken } from './material-rules';
import type { MadeFill, Objects } from './objects';
import type { StrokeId, StrokeTarget } from './stroke-id';

/** How far (px) beyond a Line's edge a right-click still Releases it. */
const RELEASE_REACH = 4;

/** What a Stroke makes, or would make: a Line or an Object, in its Colour, and the Ink (px²) it takes. */
export type MadeStroke =
  | {
      readonly kind: 'line';
      readonly colour: Colour;
      /** Its Ink as drawn. */
      readonly ink: number;
      /** Each Piece's Ink, in order along the Line: together they are `ink`. */
      readonly pieces: readonly number[];
      /**
       * Of each Piece's Ink, in the same order, what lies on a Line that was
       * standing when it was made: where its centre line is inside that
       * Line's band.
       */
      readonly onLines: readonly number[];
      /**
       * Whether it is, or would be, Grounded: it touches the Terrain, or a
       * Grounded Line, within the ground tolerance.
       */
      readonly grounded: boolean;
    }
  | {
      readonly kind: 'object';
      readonly colour: Colour;
      /** Its Outline's Ink. */
      readonly ink: number;
    };

/** What adding a Stroke made, under its new id. */
export type AddedStroke = MadeStroke & { readonly id: StrokeId };

/** What taking back a Stroke took, in its Colour, and its Ink (px²). */
export type RemovedStroke =
  /** A Line, whatever is left of it: `ink` is what its Pieces still there hold. */
  | { readonly kind: 'line'; readonly id: StrokeId; readonly colour: Colour; readonly ink: number }
  /** An Object: its Outline's Ink, and its Fill's, if it had one, which went with it. */
  | {
      readonly kind: 'object';
      readonly id: StrokeId;
      readonly colour: Colour;
      readonly ink: number;
      readonly fill: MadeFill | null;
    }
  /** It was gone already: broken, erased, removed or taken back. */
  | { readonly kind: 'gone'; readonly id: StrokeId };

/** What the Stroke pipeline made of a Stroke that is added. */
export type DrawnStroke = Extract<StrokeResult, { readonly kind: 'line' | 'object' }>;

/**
 * What goes for every Stroke, a Line or an Object alike: their one run of
 * ids, never reused, not even after R or Clear; measuring and adding a
 * Stroke, and a Line squeezing the Objects it crosses; Releasing what is
 * under a click, an Object before a Line; and Releasing, removing, taking
 * back and breaking a Stroke by its id or its target, whichever it is. It
 * keeps no list of its own: `Lines` and `Objects` each say what they hold.
 */
export class Strokes {
  private nextId = 1;

  constructor(
    private readonly lines: Lines,
    private readonly objects: Objects,
    private readonly query: Pick<ArenaQuery, 'lyingOnLines' | 'touchedBy'>,
    /** Appends to the list of what happened: a Release. */
    private readonly say: (happening: Happening) => void,
  ) {}

  /**
   * What the Line or Object the Stroke pipeline made would be in `colour`,
   * and its Ink: a Line's Pieces' each, and how much of each lies on a Line
   * standing now.
   */
  measure(result: DrawnStroke, colour: Colour): MadeStroke {
    if (result.kind === 'object')
      return { kind: 'object', colour, ink: outlineInk(result.outline) };
    const { thickness } = result;
    return {
      kind: 'line',
      colour,
      ink: lineInk(result.segments, thickness),
      pieces: result.pieces.map((piece) => lineInk(piece, thickness)),
      onLines: result.pieces.map((piece) => lineInk(this.query.lyingOnLines(piece), thickness)),
      grounded: this.lines.grounds(result.segments, thickness),
    };
  }

  /**
   * Adds the Line or Object the Stroke pipeline made, in `colour`, and says
   * how much Ink it took. A Line touching the Terrain, or a Grounded Line,
   * is Grounded, and fixed; one that isn't hangs Frozen, as an Object does,
   * and a Grounded one grounds the Frozen Lines it touches that haven't
   * fallen. While physics is `running`, it squeezes what it crosses off the
   * Lines at once.
   */
  add(result: DrawnStroke, colour: Colour, running: boolean): AddedStroke {
    const id = this.nextId++;
    // Measured before its Pieces are added, so that it never lies on itself.
    const made = this.measure(result, colour);
    if (result.kind === 'line') {
      this.lines.add(id, result.pieces, result.thickness, colour);
      if (running) this.squeeze(this.objects.crossedBy(this.lines.worldCapsules(id)));
    } else {
      const object = this.objects.add(id, result, colour);
      if (running) this.squeeze([object]);
    }
    return { ...made, id };
  }

  /** Squeezes every Object off the Lines crossing it, as physics starts. */
  squeezeAll(): void {
    this.squeeze(this.objects.crossedBy(this.lines.worldCapsules()));
  }

  private squeeze(objects: Parameters<Objects['squeeze']>[0]): void {
    if (objects.length > 0) this.objects.squeeze(objects, this.lines.worldCapsules());
  }

  /**
   * Releases the Frozen Object under `point`, if any, or else the Frozen Run
   * of a Line there, the most recently drawn Line's first: only that Run,
   * not the rest of its Line. Returns whether one was Released.
   */
  releaseAt(point: Vec2): boolean {
    const object = this.objects.frozenAt(point);
    if (object) return this.release(object.id);
    const near = this.query.touchedBy({ path: [point], radius: RELEASE_REACH });
    const pieces = near.flatMap((thing) => (thing.thing === 'piece' ? [thing] : []));
    for (const { id, index } of pieces.sort((p, q) => q.id - p.id || p.index - q.index)) {
      if (!this.lines.releasePiece(id, index)) continue;
      this.say({ kind: 'released', id });
      return true;
    }
    return false;
  }

  /**
   * Releases a Frozen Object, or every Frozen Run of a Line, optionally
   * setting it moving.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const released = this.objects.has(id)
      ? this.objects.release(id, velocity)
      : this.lines.release(id, velocity);
    if (released) this.say({ kind: 'released', id });
    return released;
  }

  /**
   * Removes one Stroke with its Fill, for `why`. What a Grounded Line held
   * up falls at the end of the `together` this runs in.
   */
  remove(id: StrokeId, why: Why): void {
    if (this.lines.has(id)) this.lines.remove(id, why);
    else this.objects.remove(id, why);
  }

  /**
   * Takes back what's left of a Stroke: an Object with its Fill, or a Line's
   * Pieces still there. Says what it took back and its Ink, or that the
   * Stroke was gone already.
   */
  removeStroke(id: StrokeId): RemovedStroke {
    if (this.lines.has(id)) {
      const { colour, ink } = this.lines.remove(id, 'undone')!;
      return { kind: 'line', id, colour, ink };
    }
    const object = this.objects.remove(id, 'undone');
    if (!object) return { kind: 'gone', id };
    const { colour, outline, fill } = object;
    return {
      kind: 'object',
      id,
      colour,
      ink: outlineInk(outline),
      fill: fill && { colour: fill, ink: fillInk(outline) },
    };
  }

  /**
   * Breaks an Object or a Piece that the Material rules broke, and reports
   * what comes out of it. A broken Object's body is removed; its Debris and
   * its Fill come out where it was. A broken Piece's body is removed, and
   * the rest of its Line stays where it is until the step's Collapse; the
   * Line goes with its last Piece.
   */
  break(target: StrokeTarget): Broken | null {
    return target.kind === 'object' ? this.objects.break(target) : this.lines.breakPiece(target);
  }
}
