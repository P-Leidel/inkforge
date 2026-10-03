import { bandPolygon } from '../geometry/separation';
import { polygonBounds } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { applyTransform, type Transform } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
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
 * A Line. Its segments are in its own coordinates; place them with
 * `transform`. A Grounded Line never moves, so its own coordinates are the
 * world's; one that isn't Grounded moves as one body.
 */
export interface LineView extends Poses {
  readonly id: StrokeId;
  readonly colour: Colour;
  /** Capsule centre lines of the Pieces still there. */
  readonly segments: readonly Segment[];
  readonly thickness: number;
  /** The Pieces still there, in order along the Line. */
  readonly pieces: readonly PieceView[];
  /** Whether it is Grounded: fixed where it was drawn. */
  readonly grounded: boolean;
  /** Whether it hangs Frozen: never for a Grounded one. */
  readonly frozen: boolean;
  /** Linear velocity, px/s: 0 for a Grounded one. */
  readonly velocity: Vec2;
}

/**
 * One Piece of a Line, with its own damage: a Grounded Line's is its own
 * fixed body; one that isn't Grounded is some of its Line's body.
 */
export interface Piece extends Breakable {
  readonly kind: 'piece';
  readonly lineId: StrokeId;
  readonly index: number;
  /** In its Line's own coordinates: the world's, for a Grounded Line. */
  readonly segments: readonly Segment[];
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly body: BodyId;
  /** True if its Line isn't Grounded. */
  readonly loose: boolean;
}

/**
 * How a Line stands, its form: Grounded, each of its Pieces a fixed body of
 * its own; or not, one body that hangs Frozen until it falls.
 */
type Form =
  | { readonly kind: 'grounded' }
  | {
      readonly kind: 'loose';
      readonly body: BodyId;
      /**
       * Whether it has fallen: it was Released, hit or blasted loose. It
       * stays loose, and never becomes Grounded again.
       */
      fell: boolean;
    };

interface Line {
  readonly id: StrokeId;
  /**
   * Its Party id. A Grounded Line has no body, but each of its Pieces'
   * Parties carries it as their Stroke; one that isn't Grounded has one body,
   * whose Parties its Pieces are.
   */
  readonly party: PartyId;
  readonly colour: Colour;
  readonly thickness: number;
  /** The Pieces still there, in order; broken ones are gone. */
  pieces: Piece[];
  form: Form;
}

/** A Line's that isn't Grounded, when a snapshot is taken: its pose, motion and mass. */
export interface LineMotion extends Motion {
  readonly frozen: boolean;
  readonly mass: number;
}

type SavedPiece = Omit<Piece, 'body'>;

/** What a Line is, apart from its Pieces and its form. */
type LineBase = Omit<Line, 'pieces' | 'form'>;

/** A Line in a snapshot. */
export interface SavedLine extends LineBase {
  readonly kind: 'line';
  /** Whether it has fallen; never for a Grounded Line. */
  readonly fell: boolean;
  readonly pieces: readonly SavedPiece[];
  /** Null for a Grounded Line. */
  readonly motion: LineMotion | null;
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

/** A Line's capsules, one per segment of each Piece still there, in order. */
function capsulesOf(line: Line): Capsule[] {
  return line.pieces.flatMap((piece) => pieceCapsules(piece, line.thickness));
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
  /** A new Stroke id, for a Line that Line `of` splits into, after the Strokes there are. */
  readonly split: (of: StrokeId) => StrokeId;
}

/**
 * The Lines, and how each stands: Grounded, hanging Frozen or fallen. It
 * changes a Line's form, keeping its Pieces, their Parties and what is
 * stuck to them, and says `reformed`: when a Grounded Line drawn to touch a
 * Frozen one grounds it, and in a Collapse, when what a Piece that went
 * held up falls. A Collapse waits until whatever took Pieces away is done
 * (`together`), or until the end of the step, and is never left for anyone
 * else to start.
 */
export class Lines {
  /** By id, in the order they were drawn. */
  private lines = new Map<StrokeId, Line>();
  /**
   * The capsules, in world coordinates, of the fixed Pieces that went since
   * grounding was last checked again (`collapse`).
   */
  private cut: Capsule[] = [];
  /** How many `together`s are running. */
  private batching = 0;

  constructor(private readonly deps: LinesDeps) {}

  get views(): LineView[] {
    const { physics, numbers, poses } = this.deps;
    return [...this.lines.values()].map((line) => {
      const { form } = line;
      return {
        id: line.id,
        colour: line.colour,
        thickness: line.thickness,
        segments: line.pieces.flatMap((piece) => piece.segments),
        pieces: line.pieces.map((piece) => ({
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
    });
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
    const base = { id, party, colour, thickness };
    const line = touches.grounded
      ? this.addGrounded(base, saved)
      : this.addLoose(base, saved, false, {
          transform: origin,
          velocity: { x: 0, y: 0 },
          angularVelocity: 0,
          frozen: true,
          mass: lineMass(segments, thickness, colour, materials),
        });
    this.lines.set(id, line);
    if (touches.grounded) this.groundTouched(touches.loose);
  }

  /** Adds a Grounded Line: each of its Pieces a fixed body of its own. */
  private addGrounded(line: LineBase, pieces: readonly SavedPiece[]): Line {
    return {
      ...line,
      form: { kind: 'grounded' },
      pieces: pieces.map((piece) => this.addPiece(piece, line.thickness, line.party)),
    };
  }

  /**
   * Adds a Line that isn't Grounded: one moving body, as `motion` has it,
   * each of its Pieces some of its capsules and a Party of its own.
   */
  private addLoose(
    line: LineBase,
    saved: readonly SavedPiece[],
    fell: boolean,
    motion: LineMotion,
  ): Line {
    const { colour, thickness, party, id } = line;
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
      ...line,
      form: { kind: 'loose', body: pieces[0]!.body, fell },
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
   * Grounds the Lines with these ids, if they are Frozen and haven't fallen,
   * and the Frozen ones they touch in turn: a Grounded Line drawn to touch
   * them holds them. Each becomes fixed where it hangs, its Pieces' damage
   * and all, with what is stuck to it, and is `reformed`.
   */
  private groundTouched(ids: readonly StrokeId[]): void {
    const queue = [...ids];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const line = this.lines.get(id);
      if (!line || line.form.kind === 'grounded' || this.hasFallen(line)) continue;
      const { body } = line.form;
      const transform = this.deps.physics.getTransform(body);
      const saved = line.pieces.map(({ body: _body, segments, ...piece }) => ({
        ...piece,
        segments: segments.map(({ a, b }) => ({
          a: applyTransform(a, transform),
          b: applyTransform(b, transform),
        })),
        loose: false,
      }));
      this.reform(line, () => {
        // Quietly, so no one hears why: its Pieces come straight back.
        this.deps.bodies.removeBody(body, 'undone');
        const { form, pieces } = this.addGrounded(line, saved);
        line.form = form;
        line.pieces = pieces;
      });
      const segments = saved.flatMap((piece) => piece.segments);
      queue.push(...this.touches(segments, line.thickness).loose);
    }
  }

  /**
   * Runs `act`, which takes away the bodies of `line`'s Pieces and adds them
   * again in another form, under the same Parties: quietly, keeping what is
   * stuck to them. Then says it `reformed`.
   */
  private reform(line: Line, act: () => void): void {
    const parties = new Set(line.pieces.map((piece) => piece.party));
    this.deps.rehost(parties, () => this.deps.quietly(act));
    this.deps.say({ kind: 'reformed', id: line.id });
  }

  /**
   * Whether a Line that isn't Grounded has fallen: it has moved since it was
   * drawn, even if it is Frozen again now.
   */
  private hasFallen(line: Line): boolean {
    const { form } = line;
    if (form.kind === 'grounded') return false;
    if (!form.fell && !this.deps.physics.isFrozen(form.body)) form.fell = true;
    return form.fell;
  }

  /** Every Piece still there, Line by Line in drawing order: what may glue. */
  *pieces(): Iterable<Piece> {
    for (const line of this.lines.values()) yield* line.pieces;
  }

  /** The capsules of Line `id`, or of every Line, where they are now, in world coordinates. */
  worldCapsules(id?: StrokeId): Capsule[] {
    const lines = id === undefined ? [...this.lines.values()] : [this.lines.get(id)!];
    return lines.flatMap((line) => {
      const capsules = capsulesOf(line);
      if (line.form.kind === 'grounded') return capsules;
      const transform = this.deps.physics.getTransform(line.form.body);
      return capsules.map(({ segment: { a, b }, radius }) => ({
        segment: { a: applyTransform(a, transform), b: applyTransform(b, transform) },
        radius,
      }));
    });
  }

  /** Whether Line `id` hangs Frozen. */
  isFrozen(id: StrokeId): boolean {
    const form = this.lines.get(id)?.form;
    return form?.kind === 'loose' && this.deps.physics.isFrozen(form.body);
  }

  /**
   * Releases Line `id`, if it hangs Frozen, optionally setting it moving:
   * it has fallen.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const line = this.lines.get(id);
    if (!line || line.form.kind === 'grounded') return false;
    const { physics } = this.deps;
    const { body } = line.form;
    if (!physics.isFrozen(body)) return false;
    physics.release(body);
    line.form.fell = true;
    if (velocity) physics.setVelocity(body, velocity);
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
   * Takes Line `id` away, for `why`: what a Grounded one held up falls at
   * the end of the `together` this runs in. Says what it left, or null if
   * it was gone already.
   */
  remove(id: StrokeId, why: Why): TakenLine | null {
    const line = this.lines.get(id);
    if (!line) return null;
    return this.together(() => {
      this.lines.delete(id);
      const { form } = line;
      if (form.kind === 'grounded') {
        this.cut.push(...capsulesOf(line));
        for (const piece of line.pieces) this.deps.bodies.removeBody(piece.body, why);
      } else {
        this.deps.bodies.removeBody(form.body, why);
      }
      const segments = line.pieces.flatMap((piece) => piece.segments);
      return { colour: line.colour, ink: lineInk(segments, line.thickness) };
    });
  }

  /**
   * Removes Piece `index` of Line `id`, for `why`; the rest of the Line
   * stays where it is, fixed or as one body, and the Line goes with its last
   * Piece. What a fixed one held up falls at the end of the `together` this
   * runs in.
   */
  removePiece(id: StrokeId, index: number, why: Why): void {
    const line = this.lines.get(id);
    const piece = line?.pieces.find((p) => p.index === index);
    if (line && piece) this.together(() => this.dropPiece(line, piece, why));
  }

  private dropPiece(line: Line, piece: Piece, why: Why): void {
    if (line.pieces.length === 1) {
      this.remove(line.id, why);
      return;
    }
    if (line.form.kind === 'grounded') {
      this.cut.push(...pieceCapsules(piece, line.thickness));
      this.deps.bodies.removeBody(piece.body, why);
    } else {
      this.deps.bodies.removePart(piece.party, why);
    }
    line.pieces = line.pieces.filter((p) => p !== piece);
  }

  /**
   * Breaks a Piece that the Material rules broke, and reports what comes out
   * of it: its body is removed, and the rest of its Line stays where it is
   * until the step's `collapse`; the Line goes with its last Piece.
   */
  breakPiece(piece: Piece): Broken | null {
    const line = this.lines.get(piece.lineId);
    if (!line) return null;
    const { physics } = this.deps;
    const { form } = line;
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
    const line = this.lines.get(id)!;
    const { pieces, form, ...base } = line;
    const fell = this.hasFallen(line);
    return {
      kind: 'line',
      ...base,
      fell,
      pieces: pieces.map(({ body: _body, ...piece }) => piece),
      motion: form.kind === 'grounded' ? null : this.lineMotion(form.body),
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
  restore({ kind: _kind, pieces, motion, fell, ...base }: SavedLine): void {
    this.lines.set(
      base.id,
      motion === null ? this.addGrounded(base, pieces) : this.addLoose(base, pieces, fell, motion),
    );
  }

  clear(): void {
    this.lines = new Map();
    this.cut = [];
  }

  /** What a fixed Piece that broke this step held up falls. */
  step(): void {
    this.collapse();
  }

  /**
   * Collapse: checks grounding again where fixed Pieces went since it last
   * checked, over connected runs of Pieces, not whole Lines. The fixed
   * Pieces that touched one that went are followed through the fixed Pieces
   * they touch, within the ground tolerance; a run that reaches the Terrain
   * or the Ink Core stays, and one that doesn't is cut off and falls at
   * once. So it only looks at the Pieces connected to what went, and stops
   * as soon as a run is found to stand.
   *
   * Of a cut-off run, each Line's Pieces that touch each other fall as one
   * body, as a fallen Line: several Lines cut off together fall as several
   * bodies, and a Line cut in two keeps its id for what still stands, or
   * else for its first run, which is `reformed`; each other run falls as a
   * Line of its own, said as `split`. Each keeps its Pieces, their places
   * along the Line and their damage.
   */
  private collapse(): void {
    if (this.cut.length === 0) return;
    const { query, materials } = this.deps;
    const tolerance = materials.groundTolerance;
    const starts = query.holding(this.cut, tolerance).pieces;
    this.cut = [];
    const standing = new Set<string>();
    const falling = new Map<string, Piece>();
    /** The fixed Pieces each falling one touches, by key. */
    const links = new Map<string, string[]>();
    for (const start of [...starts].sort(byPlace)) {
      const startKey = pieceKey(start);
      if (standing.has(startKey) || falling.has(startKey)) continue;
      const first = this.fixedPiece(start);
      if (!first) continue;
      const run = new Map<string, Piece>([[startKey, first]]);
      const touching = new Map<string, string[]>();
      const queue = [first];
      let stands = false;
      for (let k = 0; k < queue.length && !stands; k++) {
        const piece = queue[k]!;
        const key = pieceKey({ thing: 'piece', id: piece.lineId, index: piece.index });
        const { thickness } = this.lines.get(piece.lineId)!;
        const held = query.holding(pieceCapsules(piece, thickness), tolerance);
        if (held.ground) stands = true;
        const touched: string[] = [];
        for (const other of [...held.pieces].sort(byPlace)) {
          const otherKey = pieceKey(other);
          if (otherKey === key) continue;
          if (standing.has(otherKey)) stands = true;
          touched.push(otherKey);
          if (run.has(otherKey)) continue;
          const found = this.fixedPiece(other);
          if (!found) continue;
          run.set(otherKey, found);
          queue.push(found);
        }
        touching.set(key, touched);
      }
      if (stands) {
        for (const key of run.keys()) standing.add(key);
      } else {
        for (const [key, piece] of run) falling.set(key, piece);
        for (const [key, touched] of touching) links.set(key, touched);
      }
    }
    const lineIds = [...new Set([...falling.values()].map((piece) => piece.lineId))];
    for (const id of lineIds.sort((p, q) => p - q)) this.cutOff(id, falling, links);
  }

  /**
   * Lets the Pieces of Grounded Line `id` that are `falling` fall, each run
   * of them that touch each other (`links`) as one body.
   */
  private cutOff(
    id: StrokeId,
    falling: ReadonlyMap<string, Piece>,
    links: ReadonlyMap<string, readonly string[]>,
  ): void {
    const line = this.lines.get(id)!;
    const keyOf = (piece: Piece) => pieceKey({ thing: 'piece', id, index: piece.index });
    const mine = line.pieces.filter((piece) => falling.has(keyOf(piece)));
    // Runs of its falling Pieces that touch each other, in order along it.
    const runs: Piece[][] = [];
    const placed = new Set<string>();
    for (const piece of mine) {
      if (placed.has(keyOf(piece))) continue;
      const run = [piece];
      placed.add(keyOf(piece));
      for (let k = 0; k < run.length; k++) {
        for (const key of links.get(keyOf(run[k]!)) ?? []) {
          const other = falling.get(key);
          if (!other || other.lineId !== id || placed.has(key)) continue;
          placed.add(key);
          run.push(other);
        }
      }
      runs.push(run.sort((p, q) => p.index - q.index));
    }
    const stays = line.pieces.filter((piece) => !falling.has(keyOf(piece)));
    // The run that keeps the Line's id, if none of it still stands.
    const kept = stays.length === 0 ? runs[0]! : [];
    const { bodies } = this.deps;
    this.deps.rehost(new Set(mine.map((piece) => piece.party)), () => {
      // Quietly, so no one hears why: the kept run's Pieces come straight back.
      this.deps.quietly(() => {
        for (const piece of kept) bodies.removeBody(piece.body, 'undone');
      });
      for (const piece of mine) if (!kept.includes(piece)) bodies.removeBody(piece.body, 'cut-off');
      for (const run of runs) {
        if (run === kept) {
          this.deps.quietly(() => {
            const { form, pieces } = this.fall(line, run);
            line.form = form;
            line.pieces = pieces;
          });
          continue;
        }
        const into = this.deps.split(id);
        this.deps.say({ kind: 'split', id, into });
        const party = bodies.newId();
        const base = { id: into, party, colour: line.colour, thickness: line.thickness };
        this.lines.set(into, this.fall(base, run));
      }
    });
    if (stays.length > 0) line.pieces = stays;
    else this.deps.say({ kind: 'reformed', id });
  }

  /**
   * Adds Line `line` falling from where `pieces`, fixed ones that were cut
   * off, stood: one moving body, as a fallen Line.
   */
  private fall(line: LineBase, pieces: readonly Piece[]): Line {
    const segments = pieces.flatMap((piece) => piece.segments);
    const origin = { ...middleOf(segments), angle: 0 };
    const saved = pieces.map(({ body: _body, segments, ...piece }) => ({
      ...piece,
      lineId: line.id,
      segments: segments.map(({ a, b }) => ({ a: sub(a, origin), b: sub(b, origin) })),
      loose: true,
    }));
    return this.addLoose(line, saved, true, {
      transform: origin,
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      frozen: false,
      mass: lineMass(segments, line.thickness, line.colour, this.deps.materials),
    });
  }

  /** The fixed Piece a query found, if its Line is still Grounded. */
  private fixedPiece({ id, index }: FoundPiece): Piece | undefined {
    const line = this.lines.get(id);
    if (!line || line.form.kind !== 'grounded') return undefined;
    return line.pieces.find((piece) => piece.index === index);
  }
}

/** Pieces in drawing order: by their Line's id, then their place along it. */
function byPlace(p: FoundPiece, q: FoundPiece): number {
  return p.id - q.id || p.index - q.index;
}
