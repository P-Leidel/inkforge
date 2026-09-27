import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { FillOutcome, StrokeOutcome } from '../sandbox/sandbox-world';
import { isClosingStroke } from '../stroke/close-detection';
import { isFillClick } from '../stroke/fill-click';
import type { RejectionReason, StrokeResult } from '../stroke/stroke-pipeline';

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

/**
 * The commands drawing input issues: what the Sandbox world offers today.
 * The Game implements them in milestone 3. Drawing input never works out
 * what a Stroke becomes or whether it is refused: it asks.
 */
export interface DrawingCommands {
  submitStroke(samples: readonly Vec2[], colour: Colour): StrokeOutcome;
  /** What a Stroke would become if it were submitted now, without adding it. */
  previewStroke(samples: readonly Vec2[]): StrokeResult;
  fillAt(point: Vec2, colour: Colour): FillOutcome;
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
      readonly refused: boolean;
      readonly pointer: Vec2 | null;
    };

/**
 * Drawing input: turns a press, a drag and a release into commands, and
 * says what the preview and the flash show. It remembers the picked tool, a
 * Colour or the Eraser, the Stroke being drawn and the Eraser's path. The
 * scene forwards pointer and tool events to it and draws what it is told.
 */
export class DrawingInput {
  private picked: Tool = 'grey';
  /** Where the pointer is over the canvas, or null while it is off it. */
  private pointer: Vec2 | null = null;
  /** Pointer samples of the Stroke being drawn, or null. */
  private stroke: Vec2[] | null = null;
  /** The Eraser's path since it last erased, while its button is held, or null. */
  private erasing: Vec2[] | null = null;
  /** Whether the Stroke being drawn would be refused as an overlapping Object. */
  private refused = false;
  /** Sample count the refusal was last worked out at. */
  private checkedSamples = 0;

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
   * flash if the Fill or the Stroke was refused.
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
      if (outcome.kind !== 'already-filled') return null;
      const { outline } = outcome;
      return { path: [...outline, outline[0]!], message: 'Already filled', pointer };
    }
    const outcome = this.commands.submitStroke(stroke, this.picked);
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
   * What the preview shows now. Whether a closing Stroke would be refused is
   * worked out again only when it has new samples.
   */
  preview(): DrawingPreview {
    const pointer = this.pointer;
    if (this.picked === 'eraser') return { kind: 'brush', pointer };
    this.updateRefusal();
    const { stroke: samples, refused } = this;
    return { kind: 'stroke', colour: this.picked, samples, refused, pointer };
  }

  private erase(): void {
    const path = this.erasing;
    if (!path) return;
    this.commands.eraseAlong(path, ERASER_RADIUS);
    this.erasing = [path[path.length - 1]!];
  }

  private updateRefusal(): void {
    const stroke = this.stroke;
    if (!stroke || !isClosingStroke(stroke)) {
      this.refused = false;
      this.checkedSamples = 0;
      return;
    }
    if (stroke.length === this.checkedSamples) return;
    this.checkedSamples = stroke.length;
    const preview = this.commands.previewStroke(stroke);
    this.refused = preview.kind === 'rejected' && preview.reason === 'overlaps';
  }
}
