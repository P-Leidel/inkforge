import type { Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { Random } from '../sandbox/random';
import type { DropInk } from '../sandbox/sandbox-world';
import { LINE_THICKNESS } from '../stroke/stroke-rules';

/** Seconds a dot takes from the body to its gauge, at the least and the most. */
const FLIGHT_MIN = 0.55;
const FLIGHT_MAX = 0.85;
/** The most a dot waits before it sets off, s: the burst goes out as a spray, not in one lump. */
const STAGGER = 0.2;
/** One dot per this much Ink of a Colour, in Line length, within the bounds below. */
const INK_PER_DOT = 12;
const MIN_DOTS = 1;
const MAX_DOTS = 8;
/** How far (px) the dots scatter from the body before they curve away to the gauges. */
const SCATTER = 70;

/** One dot as it is drawn. */
export interface DropDot {
  readonly colour: Colour;
  readonly position: Vec2;
  /** Radius, px: it shrinks a little as it reaches its gauge. */
  readonly radius: number;
}

interface Dot {
  readonly colour: Colour;
  readonly from: Vec2;
  /** The point it curves by: out from the body, scattered. */
  readonly via: Vec2;
  readonly to: Vec2;
  readonly flight: number;
  /** Seconds since it was let out; below 0 while it waits to set off. */
  age: number;
}

/**
 * The Drop burst: a spray of coloured dots that flies from a dead Enemy's
 * body to the gauges, one Colour's dots to its own gauge, more for more Ink.
 * Purely visual: it moves in real time, so it finishes even once physics
 * pauses as a Wave ends, and its randomness is its own.
 */
export class DropBursts {
  private dots: Dot[] = [];

  /** @param gaugeAt Where each Colour's gauge is, in the same coordinates as the world. */
  constructor(
    private readonly random: Random,
    private readonly gaugeAt: (colour: Colour) => Vec2,
  ) {}

  /** Dots in flight. */
  get count(): number {
    return this.dots.length;
  }

  /** Lets out a Drop's dots from `at`: none for a Colour it holds none of. */
  burst(at: Vec2, ink: DropInk): void {
    for (const colour of COLOURS) {
      const length = ink[colour] / LINE_THICKNESS;
      if (length <= 0) continue;
      const count = Math.round(Math.min(MAX_DOTS, Math.max(MIN_DOTS, length / INK_PER_DOT)));
      const to = this.gaugeAt(colour);
      for (let k = 0; k < count; k++) {
        const angle = this.random.range(-Math.PI, 0); // upward, mostly
        const reach = this.random.range(SCATTER / 2, SCATTER);
        this.dots.push({
          colour,
          from: at,
          via: { x: at.x + Math.cos(angle) * reach, y: at.y + Math.sin(angle) * reach },
          to,
          flight: this.random.range(FLIGHT_MIN, FLIGHT_MAX),
          age: -this.random.range(0, STAGGER),
        });
      }
    }
  }

  /** Moves every dot on by `seconds`; a dot that reached its gauge is gone. */
  advance(seconds: number): void {
    if (seconds <= 0 || this.dots.length === 0) return;
    for (const dot of this.dots) dot.age += seconds;
    this.dots = this.dots.filter((dot) => dot.age < dot.flight);
  }

  /** Every dot that has set off, where it is on its curve. */
  get views(): readonly DropDot[] {
    return this.dots
      .filter((dot) => dot.age >= 0)
      .map(({ colour, from, via, to, flight, age }) => {
        // Eased in and out along a quadratic curve from the body, by `via`, to the gauge.
        const s = age / flight;
        const t = s * s * (3 - 2 * s);
        const u = 1 - t;
        return {
          colour,
          position: {
            x: u * u * from.x + 2 * u * t * via.x + t * t * to.x,
            y: u * u * from.y + 2 * u * t * via.y + t * t * to.y,
          },
          radius: 4 - 1.5 * t,
        };
      });
  }

  clear(): void {
    this.dots = [];
  }
}
