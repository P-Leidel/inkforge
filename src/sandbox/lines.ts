import { bandPolygon } from '../geometry/separation';
import { boundsOverlap, polygonBounds, type Bounds } from '../geometry/polygon';
import { distanceSegmentToSegment, type Segment } from '../geometry/segment';
import { applyTransform, type Transform } from '../geometry/transform';
import { add, sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { lineInk } from '../materials/ink';
import { lineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import { pieceCentre } from '../stroke/pieces';
import type { ArenaBodies } from './arena-bodies';
import { motionOf, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery, Capsule, FoundPiece, LineTouches } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Happening, Why } from './happenings';
import type { Broken } from './material-rules';
import type { Breakable, Numbers } from './numbers';
import type { PreviousPoses } from './previous-poses';
import type { StrokeId, StrokeTarget } from './strokes';

/** No pose: a Grounded Line's, whose own coordinates are the world's. */
const AT_ORIGIN: Transform = { x: 0, y: 0, angle: 0 };

export interface PieceView {
  /** Its place along the Line when it was drawn, counting broken Pieces. */
  readonly index: number;
  /** Capsule centre lines, in its Line's own coordinates. */
  readonly segments: readonly Segment[];
  /** Damage it can still take before it breaks. */
  readonly durability: number;
  /** How near it is to breaking, from 0 (whole) to 1: what its cracks show. */
  readonly wear: number;
}

/**
 * A Run of a Line: a connected stretch of its Pieces. Its segments are in
 * its own coordinates; place them with `transform`. A Grounded Run never
 * moves, so its own coordinates are the world's; one that isn't Grounded
 * moves as one body.
 */
export interface RunView extends Poses {
  /** Capsule centre lines of its Pieces. */
  readonly segments: readonly Segment[];
  /** Its Pieces, in order along the Line. */
  readonly pieces: readonly PieceView[];
  /** Whether it is Grounded: fixed where it was drawn. */
  readonly grounded: boolean;
  /** Whether it hangs Frozen: never for a Grounded one. */
  readonly frozen: boolean;
  /** Linear velocity, px/s: 0 for a Grounded one. */
  readonly velocity: Vec2;
}

/**
 * A Line: its Runs, each standing, hanging or falling as one. A Line drawn
 * whole is one Run until a Collapse cuts it, or a Piece that goes leaves
 * it in parts that don't touch.
 */
export interface LineView {
  readonly id: StrokeId;
  readonly colour: Colour;
  readonly thickness: number;
  /** In order along the Line, by their first Piece. */
  readonly runs: readonly RunView[];
}

/**
 * One Piece of a Line, with its own damage: a Grounded Run's is its own
 * fixed body; one that isn't Grounded is some of its Run's body.
 */
export interface Piece extends Breakable {
  readonly kind: 'piece';
  readonly lineId: StrokeId;
  readonly index: number;
  /** In its Run's own coordinates: the world's, for a Grounded Run. */
  readonly segments: readonly Segment[];
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly body: BodyId;
  /** True if its Run isn't Grounded. */
  readonly loose: boolean;
}

/**
 * How a Run stands, its form: Grounded, each of its Pieces a fixed body of
 * its own; or not, one body that hangs Frozen until it falls.
 */
type Form =
  | { readonly kind: 'grounded' }
  | {
      readonly kind: 'loose';
      readonly body: BodyId;
      /** Its body's Party id, which its Pieces' Parties carry as their Stroke. */
      readonly party: PartyId;
      /**
       * Whether it has fallen: it was Released, hit, blasted loose or cut
       * off. It stays loose, and never becomes Grounded again.
       */
      fell: boolean;
    };

/**
 * A connected stretch of a Line's Pieces, touching each other within the
 * ground tolerance, that stand, hang or fall as one. A Line has at most one
 * Grounded Run, all of its Pieces that stand; each of its other Runs holds
 * together by touching alone.
 */
interface Run {
  /** Its Pieces, in order; broken ones are gone. Never none. */
  pieces: Piece[];
  form: Form;
}

/** A Run that isn't Grounded. */
type LooseRun = Run & { readonly form: Extract<Form, { kind: 'loose' }> };

interface Line {
  readonly id: StrokeId;
  /**
   * Its Party id. A Grounded Run has no body, but each of its Pieces'
   * Parties carries it as their Stroke; the Run it was drawn as, if it
   * wasn't Grounded, has it for its body.
   */
  readonly party: PartyId;
  readonly colour: Colour;
  readonly thickness: number;
  /** In order along it, by their first Piece; never none. */
  runs: Run[];
}

/** A Run's that isn't Grounded, when a snapshot is taken: its pose, motion and mass. */
export interface LineMotion extends Motion {
  readonly frozen: boolean;
  readonly mass: number;
}

type SavedPiece = Omit<Piece, 'body'>;

/** What a Line is, apart from its Runs. */
type LineBase = Omit<Line, 'runs'>;

/** A Run's form in a snapshot. */
type SavedForm =
  | { readonly kind: 'grounded' }
  | {
      readonly kind: 'loose';
      readonly party: PartyId;
      readonly fell: boolean;
      readonly motion: LineMotion;
    };

/** A Run in a snapshot. */
export interface SavedRun {
  readonly pieces: readonly SavedPiece[];
  readonly form: SavedForm;
}

/** A Line in a snapshot. */
export interface SavedLine extends LineBase {
  readonly kind: 'line';
  readonly runs: readonly SavedRun[];
}

/** What a Line that was taken away left: its Colour and the Ink of its Pieces still there. */
export interface TakenLine {
  readonly colour: Colour;
  readonly ink: number;
}

/** The middle of a Line's segments: the middle of their bounds. */
function middleOf(segments: readonly Segment[]): Vec2 {
  const { minX, minY, maxX, maxY } = polygonBounds(segments.flatMap(({ a, b }) => [a, b]));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** A Run's capsules, one per segment of each of its Pieces, in order. */
function capsulesOf(run: Run, thickness: number): Capsule[] {
  return run.pieces.flatMap((piece) => pieceCapsules(piece, thickness));
}

/** A Piece's segments' bounds. */
const boundsOf = ({ segments }: Piece): Bounds =>
  polygonBounds(segments.flatMap(({ a, b }) => [a, b]));

/**
 * `pieces`, all in the same coordinates, as stretches that touch each other
 * within `tolerance`: their capsules, `thickness` across, come that near.
 * Each stretch is in order along its Line, and the stretches are in order
 * by their first Piece.
 */
function stretchesOf(pieces: readonly Piece[], thickness: number, tolerance: number): Piece[][] {
  const reach = thickness + tolerance;
  const sorted = [...pieces].sort((p, q) => p.index - q.index);
  const bounds = new Map(sorted.map((piece) => [piece, boundsOf(piece)]));
  const touch = (p: Piece, q: Piece) =>
    boundsOverlap(bounds.get(p)!, bounds.get(q)!, reach) &&
    p.segments.some(({ a, b }) =>
      q.segments.some((s) => distanceSegmentToSegment(a, b, s.a, s.b) <= reach),
    );
  const placed = new Set<Piece>();
  const stretches: Piece[][] = [];
  for (const piece of sorted) {
    if (placed.has(piece)) continue;
    const stretch = [piece];
    placed.add(piece);
    for (let k = 0; k < stretch.length; k++) {
      for (const other of sorted) {
        if (placed.has(other) || !touch(stretch[k]!, other)) continue;
        placed.add(other);
        stretch.push(other);
      }
    }
    stretches.push(stretch.sort((p, q) => p.index - q.index));
  }
  return stretches;
}

/**
 * The centre of mass of capsules along `segments`, `thickness` across, all
 * of one density: each weighs its area, about its middle.
 */
function centreOfMass(segments: readonly Segment[], thickness: number): Vec2 {
  const radius = thickness / 2;
  let total = 0;
  let x = 0;
  let y = 0;
  for (const { a, b } of segments) {
    const area = Math.hypot(b.x - a.x, b.y - a.y) * thickness + Math.PI * radius * radius;
    total += area;
    x += ((a.x + b.x) / 2) * area;
    y += ((a.y + b.y) / 2) * area;
  }
  return { x: x / total, y: y / total };
}

/** Runs in order along their Line, by their first Piece. */
function inOrder(runs: Run[]): Run[] {
  return runs.sort((p, q) => p.pieces[0]!.index - q.pieces[0]!.index);
}

/** Every Piece of a Line still there, Run by Run. */
function piecesOf(line: Line): Piece[] {
  return line.runs.flatMap((run) => run.pieces);
}

/** A Piece's capsules, one per segment, in its Line's own coordinates. */
function pieceCapsules(piece: Piece, thickness: number): Capsule[] {
  const radius = thickness / 2;
  return piece.segments.map((segment) => ({ segment, radius }));
}

/** A Piece's key among every Line's: its Line's id and its place along it. */
const pieceKey = ({ id, index }: FoundPiece) => `${id}.${index}`;

/** What Lines needs of the world around it. */
export interface LinesDeps {
  readonly physics: PhysicsWorld;
  readonly materials: MaterialTable;
  readonly numbers: Numbers;
  readonly bodies: ArenaBodies<StrokeTarget>;
  readonly query: Pick<ArenaQuery, 'touchingLine' | 'holding'>;
  readonly poses: Pick<PreviousPoses, 'of'>;
  /** Appends to the list of what happened. */
  readonly say: (happening: Happening) => void;
  /** Runs `act`, saying nothing of what it does. */
  readonly quietly: (act: () => void) => void;
  /**
   * Runs `act`, which takes away the bodies of Parties `parties` and adds
   * them again under the same Parties, keeping what is stuck to them.
   */
  readonly rehost: (parties: ReadonlySet<PartyId>, act: () => void) => void;
}

/**
 * The Lines, and how each of their Runs stands: Grounded, hanging Frozen or
 * fallen. It changes a Line's form, keeping its id, its Pieces, their
 * Parties and what is stuck to them, and says `reformed`: when a Grounded
 * Line drawn to touch a Frozen one grounds it, and in a Collapse, when what
 * a Piece that went held up falls as Runs of their own, or a Run that isn't
 * Grounded comes apart where a Piece of it went. A Collapse waits until
 * whatever took Pieces away is done (`together`), or until the end of the
 * step, and is never left for anyone else to start.
 */
export class Lines {
  /** By id, in the order they were drawn. */
  private lines = new Map<StrokeId, Line>();
  /**
   * The capsules, in world coordinates, of the fixed Pieces that went since
   * grounding was last checked again (`collapse`).
   */
  private cut: Capsule[] = [];
  /**
   * The Runs that aren't Grounded that lost a Piece since they were last
   * checked for coming apart (`collapse`).
   */
  private split = new Set<Run>();
  /** How many `together`s are running. */
  private batching = 0;

  constructor(private readonly deps: LinesDeps) {}

  get views(): LineView[] {
    return [...this.lines.values()].map((line) => ({
      id: line.id,
      colour: line.colour,
      thickness: line.thickness,
      runs: line.runs.map((run) => this.viewRun(run)),
    }));
  }

  private viewRun({ pieces, form }: Run): RunView {
    const { physics, numbers, poses } = this.deps;
    return {
      segments: pieces.flatMap((piece) => piece.segments),
      pieces: pieces.map((piece) => ({
        index: piece.index,
        segments: piece.segments,
        durability: numbers.durabilityLeft(piece),
        wear: numbers.wear(piece),
      })),
      grounded: form.kind === 'grounded',
      ...(form.kind === 'grounded'
        ? { transform: AT_ORIGIN, previousTransform: AT_ORIGIN }
        : poses.of(form.body)),
      frozen: form.kind === 'loose' && physics.isFrozen(form.body),
      velocity: form.kind === 'grounded' ? { x: 0, y: 0 } : physics.getVelocity(form.body),
    };
  }

  /** Whether there is a Line `id`. */
  has(id: StrokeId): boolean {
    return this.lines.has(id);
  }

  /** Whether a Line along `segments`, in world coordinates, would be Grounded. */
  grounds(segments: readonly Segment[], thickness: number): boolean {
    return this.touches(segments, thickness).grounded;
  }

  /** What a Line along `segments`, in world coordinates, would touch (`ArenaQuery.touchingLine`). */
  private touches(segments: readonly Segment[], thickness: number): LineTouches {
    const capsules = segments.map((segment) => ({ segment, radius: thickness / 2 }));
    return this.deps.query.touchingLine(capsules, this.deps.materials.groundTolerance);
  }

  /**
   * Adds Line `id` along `pieces`, each a Piece's segments in world
   * coordinates, in `colour`. One touching the Terrain, or a Grounded Line,
   * is Grounded, and fixed, and grounds the Frozen Lines it touches that
   * haven't fallen; one that isn't hangs Frozen, as an Object does.
   */
  add(id: StrokeId, pieces: readonly (readonly Segment[])[], thickness: number, colour: Colour) {
    const { bodies, materials } = this.deps;
    const segments = pieces.flat();
    const touches = this.touches(segments, thickness);
    const party = bodies.newId();
    // A Line that isn't Grounded turns about its middle, as an Object turns
    // about its centroid: its Pieces are kept relative to it.
    const origin = touches.grounded ? AT_ORIGIN : { ...middleOf(segments), angle: 0 };
    const saved: SavedPiece[] = pieces.map((segments, index) => ({
      kind: 'piece',
      lineId: id,
      index,
      colour,
      segments: segments.map(({ a, b }) => ({ a: sub(a, origin), b: sub(b, origin) })),
      party: bodies.newId(),
      damage: 0,
      impacts: 0,
      loose: !touches.grounded,
    }));
    const line: LineBase = { id, party, colour, thickness };
    const run = touches.grounded
      ? this.addGrounded(line, saved)
      : this.addLoose(line, saved, party, false, {
          transform: origin,
          velocity: { x: 0, y: 0 },
          angularVelocity: 0,
          frozen: true,
          mass: lineMass(segments, thickness, colour, materials),
        });
    this.lines.set(id, { ...line, runs: [run] });
    if (touches.grounded) this.groundTouched(touches.loose);
  }

  /** Adds a Grounded Run of `line`: each of its Pieces a fixed body of its own. */
  private addGrounded(line: LineBase, pieces: readonly SavedPiece[]): Run {
    return {
      form: { kind: 'grounded' },
      pieces: pieces.map((piece) => this.addPiece(piece, line.thickness, line.party)),
    };
  }

  /**
   * Adds a Run of `line` that isn't Grounded: one moving body, Party
   * `party`, as `motion` has it, each of its Pieces some of its capsules and
   * a Party of its own.
   */
  private addLoose(
    line: LineBase,
    saved: readonly SavedPiece[],
    party: PartyId,
    fell: boolean,
    motion: LineMotion,
  ): Run {
    const { colour, thickness, id } = line;
    const type = { kind: 'piece', colour, loose: true } as const;
    const { transform, velocity, angularVelocity, frozen, mass } = motion;
    const pieces = this.deps.bodies.addLooseLine(
      {
        position: { x: transform.x, y: transform.y },
        angle: transform.angle,
        thickness,
        mass,
        frozen,
        velocity,
        angularVelocity,
      },
      type,
      party,
      saved.map((piece) => ({
        segments: piece.segments,
        what: { thing: 'piece', id, index: piece.index },
        who: (body, shapes) => ({
          id: piece.party,
          stroke: party,
          body,
          shapes,
          target: { ...piece, body } as Piece,
        }),
      })),
    );
    return {
      form: { kind: 'loose', body: pieces[0]!.body, party, fell },
      pieces: pieces.map((p) => p.target),
    };
  }

  /** Adds a Piece's fixed body. Its Party's Stroke is its Line's, `line`. */
  private addPiece(saved: SavedPiece, thickness: number, line: PartyId): Piece {
    const { segments, colour, party, lineId, index } = saved;
    const what = { thing: 'piece', id: lineId, index } as const;
    const type = { kind: 'piece', colour } as const;
    return this.deps.bodies.addLine(segments, thickness, type, what, (body) => ({
      id: party,
      stroke: line,
      body,
      target: { ...saved, body },
    })).target;
  }

  /**
   * Grounds the Runs of the Lines with these ids that are Frozen and haven't
   * fallen, and those of the Lines they touch in turn: a Grounded Line drawn
   * to touch them holds them. Each becomes fixed where it hangs, its Pieces'
   * damage and all, with what is stuck to it, and its Line is `reformed`.
   */
  private groundTouched(ids: readonly StrokeId[]): void {
    const queue = [...ids];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const line = this.lines.get(id);
      const hanging = line?.runs.filter((run) => this.hangs(run)) ?? [];
      if (!line || hanging.length === 0) continue;
      const saved = hanging.flatMap(({ pieces, form }) => {
        const transform = this.deps.physics.getTransform(form.body);
        return pieces.map(({ body: _body, segments, ...piece }) => ({
          ...piece,
          segments: segments.map(({ a, b }) => ({
            a: applyTransform(a, transform),
            b: applyTransform(b, transform),
          })),
          loose: false,
        }));
      });
      this.reform(
        line,
        hanging.flatMap((run) => run.pieces),
        () => {
          // Quietly, so no one hears why: their Pieces come straight back.
          for (const { form } of hanging) this.deps.bodies.removeBody(form.body, 'undone');
          // What of it stands already and what it grounds stand as one Run.
          const standing = line.runs.find((run) => run.form.kind === 'grounded');
          const { form, pieces } = this.addGrounded(line, saved);
          const gone = new Set<Run>(hanging);
          const others = line.runs.filter((run) => run !== standing && !gone.has(run));
          const all = [...(standing?.pieces ?? []), ...pieces].sort((p, q) => p.index - q.index);
          line.runs = inOrder([...others, { form, pieces: all }]);
        },
      );
      const segments = saved.flatMap((piece) => piece.segments);
      queue.push(...this.touches(segments, line.thickness).loose);
    }
  }

  /**
   * Runs `act`, which takes away the bodies of `pieces`, Pieces of `line`,
   * and adds them again in another form, under the same Parties: quietly,
   * keeping what is stuck to them. Then says `line` `reformed`.
   */
  private reform(line: Line, pieces: readonly Piece[], act: () => void): void {
    const parties = new Set(pieces.map((piece) => piece.party));
    this.deps.rehost(parties, () => this.deps.quietly(act));
    this.deps.say({ kind: 'reformed', id: line.id });
  }

  /** Whether a Run hangs where it was drawn: it isn't Grounded, and hasn't fallen. */
  private hangs(run: Run): run is LooseRun {
    return run.form.kind === 'loose' && !this.hasFallen(run);
  }

  /**
   * Whether a Run that isn't Grounded has fallen: it has moved since it was
   * drawn, even if it is Frozen again now. Each step notes it (`noteFalls`).
   */
  private hasFallen({ form }: Run): boolean {
    return form.kind === 'loose' && form.fell;
  }

  /** Notes that each Run that isn't Frozen has fallen: it moved this step. */
  private noteFalls(): void {
    for (const line of this.lines.values()) {
      for (const { form } of line.runs) {
        if (form.kind === 'loose' && !this.deps.physics.isFrozen(form.body)) form.fell = true;
      }
    }
  }

  /** Every Piece still there, Line by Line in drawing order: what may glue. */
  *pieces(): Iterable<Piece> {
    for (const line of this.lines.values()) yield* piecesOf(line);
  }

  /** The capsules of Line `id`, or of every Line, where they are now, in world coordinates. */
  worldCapsules(id?: StrokeId): Capsule[] {
    const lines = id === undefined ? [...this.lines.values()] : [this.lines.get(id)!];
    return lines.flatMap((line) =>
      line.runs.flatMap((run) => {
        const capsules = capsulesOf(run, line.thickness);
        if (run.form.kind === 'grounded') return capsules;
        const transform = this.deps.physics.getTransform(run.form.body);
        return capsules.map(({ segment: { a, b }, radius }) => ({
          segment: { a: applyTransform(a, transform), b: applyTransform(b, transform) },
          radius,
        }));
      }),
    );
  }

  /**
   * Releases every Run of Line `id` that hangs Frozen, optionally setting
   * each moving: they have fallen. Says whether one was Released.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const runs = this.lines.get(id)?.runs ?? [];
    return runs.filter((run) => this.releaseRun(run, velocity)).length > 0;
  }

  /** Releases the Run with Piece `index` of Line `id`, if it hangs Frozen. */
  releasePiece(id: StrokeId, index: number): boolean {
    const run = this.lines.get(id)?.runs.find((r) => r.pieces.some((p) => p.index === index));
    return run !== undefined && this.releaseRun(run);
  }

  private releaseRun({ form }: Run, velocity?: Vec2): boolean {
    const { physics } = this.deps;
    if (form.kind === 'grounded' || !physics.isFrozen(form.body)) return false;
    physics.release(form.body);
    form.fell = true;
    if (velocity) physics.setVelocity(form.body, velocity);
    return true;
  }

  /**
   * Runs `act`, which may take Pieces away, and then lets what the fixed
   * ones that went held up fall, once: unless an outer `together` is
   * running, which will.
   */
  together<T>(act: () => T): T {
    this.batching++;
    try {
      return act();
    } finally {
      if (--this.batching === 0) this.collapse();
    }
  }

  /**
   * Takes Line `id` away, for `why`: what a Grounded Run of it held up falls
   * at the end of the `together` this runs in. Says what it left, or null if
   * it was gone already.
   */
  remove(id: StrokeId, why: Why): TakenLine | null {
    const line = this.lines.get(id);
    if (!line) return null;
    return this.together(() => {
      this.lines.delete(id);
      for (const run of line.runs) this.removeRun(line, run, why);
      const segments = piecesOf(line).flatMap((piece) => piece.segments);
      return { colour: line.colour, ink: lineInk(segments, line.thickness) };
    });
  }

  /** Removes the bodies of Run `run` of `line`, for `why`. */
  private removeRun(line: Line, { form, pieces }: Run, why: Why): void {
    if (form.kind === 'loose') {
      this.deps.bodies.removeBody(form.body, why);
      return;
    }
    this.cut.push(...capsulesOf({ form, pieces }, line.thickness));
    for (const piece of pieces) this.deps.bodies.removeBody(piece.body, why);
  }

  /**
   * Removes Piece `index` of Line `id`, for `why`; the rest of its Run stays
   * where it is, fixed or as one body. A Run goes with its last Piece, and
   * the Line with its last Run. What a fixed one held up falls, and a Run
   * that isn't Grounded comes apart where it no longer touches, at the end
   * of the `together` this runs in.
   */
  removePiece(id: StrokeId, index: number, why: Why): void {
    const line = this.lines.get(id);
    const piece = line && piecesOf(line).find((p) => p.index === index);
    if (line && piece) this.together(() => this.dropPiece(line, piece, why));
  }

  private dropPiece(line: Line, piece: Piece, why: Why): void {
    const run = line.runs.find((r) => r.pieces.includes(piece))!;
    if (run.pieces.length === 1) {
      line.runs = line.runs.filter((r) => r !== run);
      if (line.runs.length === 0) this.lines.delete(line.id);
      this.removeRun(line, run, why);
      return;
    }
    if (run.form.kind === 'grounded') {
      this.cut.push(...pieceCapsules(piece, line.thickness));
      this.deps.bodies.removeBody(piece.body, why);
    } else {
      this.deps.bodies.removePart(piece.party, why);
      this.split.add(run);
    }
    run.pieces = run.pieces.filter((p) => p !== piece);
    // A Run is in order by its first Piece.
    line.runs = inOrder(line.runs);
  }

  /**
   * Breaks a Piece that the Material rules broke, and reports what comes out
   * of it: its body is removed, and the rest of its Run stays where it is,
   * as one, until the step's `collapse`; the Line goes with its last Piece.
   */
  breakPiece(piece: Piece): Broken | null {
    const line = this.lines.get(piece.lineId);
    const run = line?.runs.find((r) => r.pieces.includes(piece));
    if (!line || !run) return null;
    const { physics } = this.deps;
    const { form } = run;
    const transform = form.kind === 'grounded' ? AT_ORIGIN : physics.getTransform(form.body);
    const velocity = form.kind === 'grounded' ? { x: 0, y: 0 } : physics.getVelocity(form.body);
    const segments = piece.segments.map(({ a, b }) => ({
      a: applyTransform(a, transform),
      b: applyTransform(b, transform),
    }));
    this.dropPiece(line, piece, 'broke');
    return {
      kind: 'piece',
      debris: {
        outline: bandPolygon(segments, line.thickness / 2),
        velocity,
        colours: [line.colour],
      },
      colour: line.colour,
      centre: pieceCentre(segments),
    };
  }

  /** Line `id` as a snapshot keeps it. */
  save(id: StrokeId): SavedLine {
    const { runs, ...base } = this.lines.get(id)!;
    return {
      kind: 'line',
      ...base,
      runs: runs.map((run) => ({
        pieces: run.pieces.map(({ body: _body, ...piece }) => piece),
        form:
          run.form.kind === 'grounded'
            ? run.form
            : {
                kind: 'loose',
                party: run.form.party,
                fell: this.hasFallen(run),
                motion: this.lineMotion(run.form.body),
              },
      })),
    };
  }

  private lineMotion(body: BodyId): LineMotion {
    const { physics } = this.deps;
    return {
      ...motionOf(physics, body),
      frozen: physics.isFrozen(body),
      mass: physics.getMass(body),
    };
  }

  /** Adds a Line again as it was saved, after the Lines there are. */
  restore({ kind: _kind, runs, ...line }: SavedLine): void {
    this.lines.set(line.id, {
      ...line,
      runs: runs.map(({ pieces, form }) =>
        form.kind === 'grounded'
          ? this.addGrounded(line, pieces)
          : this.addLoose(line, pieces, form.party, form.fell, form.motion),
      ),
    });
  }

  clear(): void {
    this.lines = new Map();
    this.cut = [];
    this.split = new Set();
  }

  /**
   * Notes which Runs moved this step, then lets what a fixed Piece that
   * broke this step held up fall, and Runs that lost a Piece come apart.
   */
  step(): void {
    this.noteFalls();
    this.collapse();
  }

  /**
   * Collapse: checks grounding again where fixed Pieces went since it last
   * checked, over connected stretches of Pieces, not whole Lines. The fixed
   * Pieces that touched one that went are followed through the fixed Pieces
   * they touch, within the ground tolerance; a stretch that reaches the Terrain
   * or the Ink Core stays, and one that doesn't is cut off and falls at
   * once. So it only looks at the Pieces connected to what went, and stops
   * as soon as a stretch is found to stand.
   *
   * Of what is cut off, each Line's Pieces that touch each other fall as one
   * body, a Run of that Line: several Lines cut off together fall as several
   * bodies, and a Line cut in two keeps its id, its Pieces, their places
   * along it and their damage, and is `reformed`.
   *
   * Then each Run that isn't Grounded and lost a Piece comes apart into the
   * stretches of it that still touch each other, the same way (`comeApart`).
   */
  private collapse(): void {
    this.cutOffWhatFell();
    const split = [...this.split];
    this.split = new Set();
    for (const run of split) this.comeApart(run);
  }

  /** Lets what the fixed Pieces that went held up fall (`collapse`). */
  private cutOffWhatFell(): void {
    if (this.cut.length === 0) return;
    const { query, materials } = this.deps;
    const tolerance = materials.groundTolerance;
    const starts = query.holding(this.cut, tolerance).pieces;
    this.cut = [];
    const standing = new Set<string>();
    const falling = new Map<string, Piece>();
    for (const start of [...starts].sort(byPlace)) {
      const startKey = pieceKey(start);
      if (standing.has(startKey) || falling.has(startKey)) continue;
      const first = this.fixedPiece(start);
      if (!first) continue;
      const stretch = new Map<string, Piece>([[startKey, first]]);
      const queue = [first];
      let stands = false;
      for (let k = 0; k < queue.length && !stands; k++) {
        const piece = queue[k]!;
        const key = pieceKey({ thing: 'piece', id: piece.lineId, index: piece.index });
        const { thickness } = this.lines.get(piece.lineId)!;
        const held = query.holding(pieceCapsules(piece, thickness), tolerance);
        if (held.ground) stands = true;
        for (const other of [...held.pieces].sort(byPlace)) {
          const otherKey = pieceKey(other);
          if (otherKey === key) continue;
          if (standing.has(otherKey)) stands = true;
          if (stretch.has(otherKey)) continue;
          const found = this.fixedPiece(other);
          if (!found) continue;
          stretch.set(otherKey, found);
          queue.push(found);
        }
      }
      if (stands) {
        for (const key of stretch.keys()) standing.add(key);
      } else {
        for (const [key, piece] of stretch) falling.set(key, piece);
      }
    }
    const lineIds = [...new Set([...falling.values()].map((piece) => piece.lineId))];
    for (const id of lineIds.sort((p, q) => p - q)) this.cutOff(id, falling);
  }

  /**
   * Lets the Pieces of the Grounded Run of Line `id` that are `falling`
   * fall, each stretch of them that touch each other (`stretchesOf`) as a
   * Run of its own, one body.
   */
  private cutOff(id: StrokeId, falling: ReadonlyMap<string, Piece>): void {
    const line = this.lines.get(id)!;
    const standing = line.runs.find((run) => run.form.kind === 'grounded')!;
    const keyOf = (piece: Piece) => pieceKey({ thing: 'piece', id, index: piece.index });
    const mine = standing.pieces.filter((piece) => falling.has(keyOf(piece)));
    const stretches = stretchesOf(mine, line.thickness, this.deps.materials.groundTolerance);
    const stays = standing.pieces.filter((piece) => !falling.has(keyOf(piece)));
    const fallen = line.runs.filter((run) => run !== standing);
    this.reform(line, mine, () => {
      // Quietly, so no one hears why: their Pieces come straight back.
      for (const piece of mine) this.deps.bodies.removeBody(piece.body, 'undone');
      const cut = stretches.map((stretch) => this.fall(line, stretch));
      const kept = stays.length > 0 ? [{ form: standing.form, pieces: stays }] : [];
      line.runs = inOrder([...kept, ...fallen, ...cut]);
    });
  }

  /**
   * A Run of `line` falling from where `pieces`, fixed ones that were cut
   * off, stood: one moving body, Party a new one.
   */
  private fall(line: LineBase, pieces: readonly Piece[]): Run {
    const segments = pieces.flatMap((piece) => piece.segments);
    const origin = { ...middleOf(segments), angle: 0 };
    const saved = pieces.map(({ body: _body, segments, ...piece }) => ({
      ...piece,
      segments: segments.map(({ a, b }) => ({ a: sub(a, origin), b: sub(b, origin) })),
      loose: true,
    }));
    return this.addLoose(line, saved, this.deps.bodies.newId(), true, {
      transform: origin,
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      frozen: false,
      mass: lineMass(segments, line.thickness, line.colour, this.deps.materials),
    });
  }

  /**
   * Lets `run`, a Run that isn't Grounded that lost a Piece, come apart into
   * the stretches of it that still touch each other (`stretchesOf`), each a
   * Run of its own, one body. Each hangs Frozen, or moves on, as `run` did:
   * where it is, with the velocity `run` had at its centre of mass and the
   * same spin; each weighs its own Ink, and has fallen if `run` had.
   */
  private comeApart(run: Run): void {
    const line = [...this.lines.values()].find((l) => l.runs.includes(run));
    if (!line || run.form.kind !== 'loose') return;
    const { physics, materials } = this.deps;
    const stretches = stretchesOf(run.pieces, line.thickness, materials.groundTolerance);
    if (stretches.length < 2) return;
    const { body, fell } = run.form;
    const { transform, velocity, angularVelocity } = motionOf(physics, body);
    const frozen = physics.isFrozen(body);
    const centre = centreOfMass(
      run.pieces.flatMap((piece) => piece.segments),
      line.thickness,
    );
    this.reform(line, run.pieces, () => {
      // Quietly, so no one hears why: their Pieces come straight back.
      this.deps.bodies.removeBody(body, 'undone');
      const parts = stretches.map((pieces) => {
        const segments = pieces.flatMap((piece) => piece.segments);
        const middle = middleOf(segments);
        const saved = pieces.map(({ body: _body, segments, ...piece }) => ({
          ...piece,
          segments: segments.map(({ a, b }) => ({ a: sub(a, middle), b: sub(b, middle) })),
        }));
        // Its centre of mass moved as that point of `run`'s body did.
        const r = sub(
          applyTransform(centreOfMass(segments, line.thickness), transform),
          applyTransform(centre, transform),
        );
        const spun = { x: -angularVelocity * r.y, y: angularVelocity * r.x };
        return this.addLoose(line, saved, this.deps.bodies.newId(), fell, {
          transform: { ...applyTransform(middle, transform), angle: transform.angle },
          velocity: frozen ? { x: 0, y: 0 } : add(velocity, spun),
          angularVelocity: frozen ? 0 : angularVelocity,
          frozen,
          mass: lineMass(segments, line.thickness, line.colour, materials),
        });
      });
      line.runs = inOrder([...line.runs.filter((r) => r !== run), ...parts]);
    });
  }

  /** The fixed Piece a query found, if it is in its Line's Grounded Run. */
  private fixedPiece({ id, index }: FoundPiece): Piece | undefined {
    const standing = this.lines.get(id)?.runs.find((run) => run.form.kind === 'grounded');
    return standing?.pieces.find((piece) => piece.index === index);
  }
}

/** Pieces in drawing order: by their Line's id, then their place along it. */
function byPlace(p: FoundPiece, q: FoundPiece): number {
  return p.id - q.id || p.index - q.index;
}
