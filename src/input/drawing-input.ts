import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type {
  Bar,
  ColourRefusal,
  CostEstimate,
  GameFillOutcome,
  GameStrokeOutcome,
  Look,
  Prospect,
} from '../game/game';
import { isFillClick } from '../stroke/fill-click';
import type { RejectionReason } from '../stroke/stroke-pipeline';

/** Radius (px) of the Eraser's brush: what it erases, shown on its swatch and at the pointer. */
export const ERASER_RADIUS = 12;

/** What the pointer does: draw and fill in a Colour, or erase. */
export type Tool = Colour | 'eraser';

/** What a flash says about a refused Stroke. */
export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  'too-small': 'Too small',
  'self-crossing': 'Shape crosses itself',
  overlaps: 'Overlaps Terrain or an Object',
};

/** What a flash says about a Stroke or a Fill its Colour's Ink Tank can't pay for. */
export const notEnough = (colour: Colour) => `Not enough ${colour}`;

/** What a flash says about a Stroke or a Fill in a Colour the Level doesn't have. */
export const NOT_IN_LEVEL = 'Not in this Level';

/** What a flash says about a Stroke or a Fill refused for its Colour. */
const colourRefusal = (reason: ColourRefusal, colour: Colour) =>
  reason === 'not-in-level' ? NOT_IN_LEVEL : notEnough(colour);

/** What a flash says about a barred Stroke or Fill, by why it was barred. */
export const BAR_MESSAGES: Record<Bar, string> = {
  lost: 'Ink Core destroyed: R or Clear',
  'not-now': 'Not now',
  'near-enemy': 'Too close to an Enemy',
};

/**
 * The commands drawing input issues, and the questions it asks: the Game
 * implements them. Drawing input never works out what a Stroke becomes,
 * whether it closes, what it costs or whether it is refused: it asks.
 */
export interface DrawingCommands {
  submitStroke(samples: readonly Vec2[], colour: Colour): GameStrokeOutcome;
  fillAt(point: Vec2, colour: Colour): GameFillOutcome;
  /** Looks at what a Stroke with these raw samples would be now; null if it would be nothing yet. */
  lookAtStroke(samples: readonly Vec2[]): Look | null;
  /** Looks at the Fill a click at `point` would make now; null with nothing to fill there. */
  lookAtFill(point: Vec2): Look | null;
  /** What a look would do in `colour`, priced now. */
  prospect(look: Look, colour: Colour): Prospect;
  /** The Sandbox world, as far as drawing input reads it: whether it changed. */
  readonly world: { readonly changes: number };
  releaseAt(point: Vec2): void;
  eraseAlong(path: readonly Vec2[], radius: number): void;
  undo(): void;
}

/** A refusal to show: `path` flashes red, with `message` at the pointer. */
export interface Flash {
  readonly path: readonly Vec2[];
  readonly message: string;
  readonly pointer: Vec2;
}

/**
 * What the preview shows: with the Eraser, its brush at the pointer;
 * with a Colour, the Stroke being drawn (red if it would be refused), or a
 * dab of the Colour at the pointer between Strokes. `pointer` is null while
 * it is off the canvas.
 */
export type DrawingPreview =
  | { readonly kind: 'brush'; readonly pointer: Vec2 | null }
  | {
      readonly kind: 'stroke';
      readonly colour: Colour;
      readonly samples: readonly Vec2[] | null;
      /** Whether the Stroke being drawn would close into an Object if let go now. */
      readonly closes: boolean;
      /**
       * Whether it would be refused whatever it costs: as an Object
       * overlapping the Terrain or an Object, outside a Wave with Waves on,
       * during one, too near an Enemy, or in a Colour the Level doesn't have.
       */
      readonly refused: boolean;
      readonly pointer: Vec2 | null;
      /**
       * The pending cost to grey out on its Colour's gauge: the Stroke being
       * drawn, or between Strokes, the Fill of the hollow Object under the
       * pointer. Null with nothing to price or Ink costs off.
       */
      readonly cost: CostEstimate | null;
    };

/**
 * Drawing input: turns a press, a drag and a release into commands, and
 * says what the preview and the flash show. It remembers the picked tool, a
 * Colour or the Eraser, the Stroke being drawn, the Eraser's path and its
 * last look at what is pending. The scene forwards pointer and tool events
 * to it and draws what it is told.
 */
export class DrawingInput {
  private picked: Tool = 'grey';
  /** Where the pointer is over the canvas, or null while it is off it. */
  private pointer: Vec2 | null = null;
  /** Pointer samples of the Stroke being drawn, or null. */
  private stroke: Vec2[] | null = null;
  /** The Eraser's path since it last erased, while its button is held, or null. */
  private erasing: Vec2[] | null = null;
  /** The last look at the Stroke being drawn or the Fill under the pointer, or null. */
  private look: Look | null = null;
  /** What `look` was taken at: see `pendingLook`. */
  private lookedAt: readonly unknown[] = [];

  constructor(private readonly commands: DrawingCommands) {}

  /** The Colour new Strokes are drawn in, or the Eraser. */
  get tool(): Tool {
    return this.picked;
  }

  /**
   * Picks a Colour to draw in, or the Eraser. A Stroke being drawn carries on
   * in a new Colour, and is dropped when the Eraser is picked; a held Eraser
   * stops when a Colour is picked.
   */
  pick(tool: Tool): void {
    this.picked = tool;
    if (tool === 'eraser') this.stroke = null;
    else this.erasing = null;
  }

  /**
   * A button goes down at `point`. The left button starts a Stroke, or with
   * the Eraser, erases there and starts its path. The right button Releases
   * the Frozen Object under it.
   */
  press(point: Vec2, button: 'left' | 'right'): void {
    this.pointer = point;
    if (button === 'right') {
      this.commands.releaseAt(point);
      return;
    }
    if (this.picked === 'eraser') {
      this.erasing = [point];
      this.erase();
    } else {
      this.stroke = [point];
    }
  }

  /** The pointer moved to `point`: a held Stroke or Eraser follows it. */
  move(point: Vec2): void {
    this.pointer = point;
    this.stroke?.push(point);
    this.erasing?.push(point);
  }

  /** The pointer left the canvas. */
  leave(): void {
    this.pointer = null;
  }

  /**
   * The button went up. The Eraser erases the rest of its path. A click
   * fills the Object under it, anything longer is a Stroke. Returns what to
   * flash if the Fill or the Stroke was refused: already filled, rejected by
   * the Stroke pipeline, barred (outside a Wave, or near an Enemy), in a
   * Colour the Level doesn't have, or more than its Ink Tank holds.
   */
  release(): Flash | null {
    this.erase();
    this.erasing = null;
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || this.picked === 'eraser') return null;
    const pointer = stroke[stroke.length - 1]!;
    if (isFillClick(stroke)) {
      const outcome = this.commands.fillAt(stroke[0]!, this.picked);
      let message: string;
      switch (outcome.kind) {
        case 'already-filled':
          message = 'Already filled';
          break;
        case 'barred':
          message = BAR_MESSAGES[outcome.reason];
          break;
        case 'refused':
          message = colourRefusal(outcome.reason, outcome.colour);
          break;
        case 'filled':
        case 'missed':
          return null;
      }
      const { outline } = outcome;
      return { path: [...outline, outline[0]!], message, pointer };
    }
    const outcome = this.commands.submitStroke(stroke, this.picked);
    if (outcome.kind === 'refused') {
      return {
        path: outcome.path,
        message: colourRefusal(outcome.reason, outcome.colour),
        pointer,
      };
    }
    if (outcome.kind === 'barred') {
      return { path: outcome.path, message: BAR_MESSAGES[outcome.reason], pointer };
    }
    if (outcome.kind !== 'rejected') return null;
    return { path: outcome.path, message: REJECTION_MESSAGES[outcome.reason], pointer };
  }

  /** Takes back the most recent Stroke or Fill. */
  undo(): void {
    this.commands.undo();
  }

  /**
   * Once a frame, before physics steps: a held Eraser erases along its path
   * since it last erased, and carries on from its end. Held still, it keeps
   * erasing what moves into the brush.
   */
  tick(): void {
    this.erase();
  }

  /**
   * What the preview shows now: the Stroke being drawn, whether it closes
   * and is refused whatever it costs, and its pending cost; between Strokes, the pending cost
   * of the Fill under the pointer. The looks behind them are taken again
   * only as `pendingLook` says, and priced afresh each time, so an undo or an
   * F2 edit shows at once.
   */
  preview(): DrawingPreview {
    const pointer = this.pointer;
    if (this.picked === 'eraser') return { kind: 'brush', pointer };
    const colour = this.picked;
    const samples = this.stroke;
    const look = this.pendingLook();
    const prospect = look && this.commands.prospect(look, colour);
    const refusal = prospect?.refusal ?? null;
    return {
      kind: 'stroke',
      colour,
      samples,
      closes: prospect?.kind === 'object',
      refused: refusal !== null && refusal !== 'not-enough',
      pointer,
      cost: prospect?.cost ?? null,
    };
  }

  /**
   * The look at what is pending: the Stroke being drawn, or between Strokes,
   * the Fill under the pointer. The one throttle rule: a look is taken again
   * only when what it was taken at changed. For a Stroke, that is its
   * samples; for a Fill, the pointer or the Sandbox world, since Objects
   * move while physics runs. Neither look depends on the Colour, which only
   * the price does.
   */
  private pendingLook(): Look | null {
    const { stroke, pointer } = this;
    if (stroke) {
      return this.lookAgain(['stroke', stroke, stroke.length], () =>
        this.commands.lookAtStroke(stroke),
      );
    }
    if (!pointer) return this.lookAgain(['nothing'], () => null);
    const { x, y } = pointer;
    return this.lookAgain(['fill', x, y, this.commands.world.changes], () =>
      this.commands.lookAtFill(pointer),
    );
  }

  /** The last look, or a new one if it was taken at anything other than `at`. */
  private lookAgain(at: readonly unknown[], look: () => Look | null): Look | null {
    const same = at.length === this.lookedAt.length && at.every((v, k) => v === this.lookedAt[k]);
    if (!same) {
      this.lookedAt = at;
      this.look = look();
    }
    return this.look;
  }

  private erase(): void {
    const path = this.erasing;
    if (!path) return;
    this.commands.eraseAlong(path, ERASER_RADIUS);
    this.erasing = [path[path.length - 1]!];
  }
}
