import { segmentsIntersect } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import type { SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { dragAlong, dragCircle } from '../stroke/pointer-paths';
import type { StressTest } from './stress-test';

const LINE_X = 960;
const LINE_TOP = 150;
const LINE_BOTTOM = 750;
/** Balls are aimed at this band of the Line, away from its ends. */
const TARGET_TOP = 250;
const TARGET_BOTTOM = 600;
/** Distance from a ball's start to the point it is aimed at. */
const RANGE = 300;
const MAX_ANGLE = (50 * Math.PI) / 180;
const SHOTS_PER_SECOND = 10;

interface Ball {
  readonly id: StrokeId;
  readonly firedAt: number;
  previous: Vec2;
  reached: boolean;
}

/**
 * Engine verdict check 1: fires balls at 3000 px/s, at random angles, at a
 * 4 px thick Line and counts any that pass through it. The Line and the
 * balls are drawn through the Stroke pipeline; each ball is then Released
 * with its velocity.
 */
export class BallCannon implements StressTest {
  static readonly LINE_THICKNESS = 4;
  static readonly BALL_RADIUS = 12;
  static readonly BALL_SPEED = 3000;
  /** A ball is removed this long after it is fired; it has hit the Line long before. */
  static readonly BALL_LIFETIME = 0.3;
  static readonly STEPS_PER_SHOT = Math.ceil(BallCannon.BALL_LIFETIME * 60) + 1;

  readonly name = 'Ball cannon';
  fired = 0;
  /** Balls that came within touching distance of the Line. */
  reachedLine = 0;
  /** Balls whose centre crossed the Line. */
  tunnelled = 0;
  private balls: Ball[] = [];
  private nextShotAt: number;

  constructor(private readonly world: SandboxWorld) {
    world.submitStroke(
      dragAlong([
        { x: LINE_X, y: LINE_TOP },
        { x: LINE_X, y: LINE_BOTTOM },
      ]),
      { lineThickness: BallCannon.LINE_THICKNESS },
    );
    if (!world.isRunning) world.togglePause();
    this.nextShotAt = world.time;
  }

  /** Draws a ball and fires it at a random point of the Line from a random angle. */
  fire(): void {
    const random = this.world.random;
    const target = { x: LINE_X, y: random.range(TARGET_TOP, TARGET_BOTTOM) };
    const angle = random.range(-MAX_ANGLE, MAX_ANGLE);
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const start = { x: target.x - RANGE * direction.x, y: target.y - RANGE * direction.y };

    const outcome = this.world.submitStroke(dragCircle(start, BallCannon.BALL_RADIUS));
    if (outcome.kind !== 'object') return;
    const speed = BallCannon.BALL_SPEED;
    this.world.release(outcome.id, { x: speed * direction.x, y: speed * direction.y });
    this.balls.push({ id: outcome.id, firedAt: this.world.time, previous: start, reached: false });
    this.fired++;
  }

  /** Checks every ball in flight since the last call; removes spent balls. */
  track(): void {
    const byId = new Map(this.world.objects.map((o) => [o.id, o]));
    const top = { x: LINE_X, y: LINE_TOP };
    const bottom = { x: LINE_X, y: LINE_BOTTOM };
    const touching = BallCannon.BALL_RADIUS + BallCannon.LINE_THICKNESS / 2 + 2;
    this.balls = this.balls.filter((ball) => {
      const object = byId.get(ball.id);
      if (!object) return false;
      const centre = { x: object.transform.x, y: object.transform.y };
      if (segmentsIntersect(ball.previous, centre, top, bottom)) this.tunnelled++;
      if (!ball.reached && Math.abs(centre.x - LINE_X) <= touching) {
        ball.reached = true;
        this.reachedLine++;
      }
      ball.previous = centre;
      if (this.world.time - ball.firedAt < BallCannon.BALL_LIFETIME) return true;
      this.world.remove(ball.id);
      return false;
    });
  }

  update(): void {
    this.track();
    while (this.world.isRunning && this.world.time >= this.nextShotAt) {
      this.fire();
      this.nextShotAt += 1 / SHOTS_PER_SECOND;
    }
  }

  status(): string {
    return `Ball cannon: ${this.fired} fired, ${this.reachedLine} hit the Line, ${this.tunnelled} passed through`;
  }
}
