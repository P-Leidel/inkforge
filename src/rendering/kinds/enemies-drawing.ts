import type Phaser from 'phaser';
import { polygonBounds } from '../../geometry/polygon';
import { transformPoints, type Transform } from '../../geometry/transform';
import type { Vec2 } from '../../geometry/vec2';
import { isBoss, type EnemyType } from '../../materials/enemy-types';
import type { EnemyView } from '../../sandbox/sandbox-world';
import { fillPolygon, strokePolygon } from '../draw';
import { gaitAfter, legAngles, STANDING, swungLeg, type Gait } from '../gait';
import { INK_HUES } from '../ink';
import { drawHpBar } from '../hp-bar';
import { PALETTE } from '../palette';
import { drawn, type DrawnKind } from './drawn-kind';

/** Enemies show over Lines and Objects, under Patches, which may lie on them. */
export const ENEMY_DEPTH = 2;
/** Width of an Enemy's outline. */
const EDGE_WIDTH = 2;
/** Size (px) of an eye, and how far in from its front and down from its top. */
const EYE_SIZE = 4;
const EYE_IN = 7;
const EYE_DOWN = 9;
/** The Belly's window's rim, light enough to show black on a dark Heavy. */
const BELLY_RIM = 0xd9d6cc;
const BELLY_RIM_WIDTH = 1.5;

/**
 * Where an Enemy shows its Belly: the window's width and height as shares
 * of the Enemy's, and how far below its centre the window's centre sits (a
 * share of its height).
 */
interface BellyPlace {
  readonly width: number;
  readonly height: number;
  readonly drop: number;
}

/** A box's Belly window: low in its body, clear of its eyes. */
const LOW_IN_BODY: BellyPlace = { width: 0.56, height: 0.4, drop: 0.14 };

/**
 * How an Enemy type looks: its body and edge colours, how far (px per px
 * up) it leans forward, and where it shows its Belly.
 */
interface Look {
  readonly body: number;
  readonly edge: number;
  readonly lean: number;
  readonly belly: BellyPlace;
}

const LOOKS: Readonly<Record<EnemyType, Look>> = {
  crawler: { body: PALETTE.crawler, edge: PALETTE.crawlerEdge, lean: 0, belly: LOW_IN_BODY },
  runner: { body: PALETTE.runner, edge: PALETTE.runnerEdge, lean: 0.25, belly: LOW_IN_BODY },
  heavy: { body: PALETTE.heavy, edge: PALETTE.heavyEdge, lean: 0, belly: LOW_IN_BODY },
  // Its Belly in its hull, above its legs.
  siegeWalker: {
    body: PALETTE.siegeWalker,
    edge: PALETTE.siegeWalkerEdge,
    lean: 0,
    belly: { width: 0.5, height: 0.3, drop: -0.22 },
  },
};

/** The colours an Enemy's pop bursts in, by its type, taken in turn: its body, edge and eyes. */
export const POP_HUES: Readonly<Record<EnemyType, readonly number[]>> = {
  crawler: [PALETTE.crawler, PALETTE.crawler, PALETTE.crawlerEdge, PALETTE.enemyEye],
  runner: [PALETTE.runner, PALETTE.runner, PALETTE.runnerEdge, PALETTE.enemyEye],
  heavy: [PALETTE.heavy, PALETTE.heavy, PALETTE.heavyEdge, PALETTE.enemyEye],
  siegeWalker: [
    PALETTE.siegeWalker,
    PALETTE.siegeWalker,
    PALETTE.siegeWalkerEdge,
    PALETTE.enemyEye,
  ],
};

/**
 * The Enemies, each as its body's outline, redrawn every frame, with a thin
 * HP bar above it once it is hurt; a boss has its bar at the top of the
 * screen instead (`BossBar`), so none over its body. Placeholder art, with
 * two eyes on the side it walks toward, the Ink Core's, which is to the
 * right: a Crawler is a low grey-brown box, a Runner a narrow one leaning
 * forward, a Heavy a big dark one, a Siege Walker a dark red hull on four
 * legs that walk with it, stand still when it stalls and flail while it is
 * Tipped (its gait, drawn only: its body stays standing). Each shows its Belly, the ink it carries, as a window
 * in its body, in that Colour's hue (a plain box, to keep each Enemy a few
 * drawing calls), so the player can see what it will spill. The window and
 * the eyes turn with a body that tips. The lean is only drawn: its body
 * stays upright. Its pop is Debris, which the renderer bursts.
 */
export class EnemiesDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;
  /** How each legged Enemy's legs are swinging, by its id. */
  private readonly gaits = new Map<number, Gait>();
  /** The world's time as of the last frame drawn, s. */
  private drawnAt: number | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly views: () => readonly EnemyView[],
  ) {
    this.graphics = scene.add.graphics().setDepth(ENEMY_DEPTH);
  }

  /** Nothing to make or free: they are drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {
    this.gaits.clear();
    this.drawnAt = null;
  }

  draw(fraction: number, now = 0): void {
    const g = this.graphics;
    g.clear();
    // The gait keeps to the world's time: paused, the legs hold still.
    const seconds = this.drawnAt === null ? 0 : Math.max(0, now - this.drawnAt);
    this.drawnAt = now;
    const views = this.views();
    this.forgetGone(views);
    for (const enemy of views) {
      const transform = drawn(enemy, fraction);
      const { body: hue, edge, lean, belly: place } = LOOKS[enemy.type];
      // Leaning forward: each point shifts ahead by how far it is above the underside.
      const leaning = ({ x, y }: Vec2) => ({ x: x + lean * (enemy.height / 2 - y), y });
      const posed = (polygon: readonly Vec2[]) => transformPoints(polygon.map(leaning), transform);
      let body: Vec2[];
      if (enemy.limbs) {
        // Its legs, swung by its gait, behind its hull, which hides their tops.
        const gait = gaitAfter(
          this.gaits.get(enemy.id) ?? STANDING,
          { speed: enemy.velocity.x, tipped: enemy.tipped },
          seconds,
        );
        this.gaits.set(enemy.id, gait);
        const angles = legAngles(gait, enemy.tipped, enemy.limbs.legs.length);
        enemy.limbs.legs.forEach((leg, k) => {
          const swung = posed(swungLeg(leg, angles[k]!));
          g.fillStyle(hue, 1);
          fillPolygon(g, swung);
          g.lineStyle(EDGE_WIDTH, edge, 1);
          strokePolygon(g, swung);
        });
        body = posed(enemy.limbs.hull);
      } else body = posed(enemy.outline);
      g.fillStyle(hue, 1);
      fillPolygon(g, body);
      const belly = bellyWindow(enemy.width, enemy.height, place);
      const bellyAt = leaning({ x: belly.x, y: belly.y + belly.height / 2 });
      const window = { ...belly, x: bellyAt.x };
      g.fillStyle(INK_HUES[enemy.belly], 1);
      fillBox(g, window, transform);
      g.lineStyle(BELLY_RIM_WIDTH, BELLY_RIM, 1);
      strokeBox(g, window, transform);
      g.lineStyle(EDGE_WIDTH, edge, 1);
      strokePolygon(g, body);
      const front = enemy.width / 2 - EYE_IN + lean * (enemy.height - EYE_DOWN);
      const top = -enemy.height / 2 + EYE_DOWN;
      g.fillStyle(PALETTE.enemyEye, 1);
      for (const right of [front, front - 2 * EYE_SIZE])
        fillBox(g, { x: right - EYE_SIZE, y: top, width: EYE_SIZE, height: EYE_SIZE }, transform);
      if (enemy.hp < enemy.fullHp && !isBoss(enemy.type)) {
        const over = polygonBounds(transformPoints(enemy.outline, transform));
        drawHpBar(g, over, enemy.hp, enemy.fullHp, 'small');
      }
    }
  }

  /** Forgets the gaits of Enemies that are gone. */
  private forgetGone(views: readonly EnemyView[]): void {
    if (this.gaits.size === 0) return;
    const here = new Set(views.map((enemy) => enemy.id));
    for (const id of this.gaits.keys()) if (!here.has(id)) this.gaits.delete(id);
  }
}

/** A box by its top left corner and its size. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A box's corners, clockwise from its top left, posed at `at`. */
function boxCorners({ x, y, width, height }: Box, at: Transform): Vec2[] {
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  return transformPoints(corners, at);
}

/** Fills a box about a body posed at `at`: a plain rectangle while the body is unturned. */
function fillBox(g: Phaser.GameObjects.Graphics, box: Box, at: Transform): void {
  if (at.angle === 0) g.fillRect(at.x + box.x, at.y + box.y, box.width, box.height);
  else fillPolygon(g, boxCorners(box, at));
}

/** Outlines a box about a body posed at `at`, as `fillBox` fills it. */
function strokeBox(g: Phaser.GameObjects.Graphics, box: Box, at: Transform): void {
  if (at.angle === 0) g.strokeRect(at.x + box.x, at.y + box.y, box.width, box.height);
  else strokePolygon(g, boxCorners(box, at));
}

/**
 * The window an Enemy `width` by `height` shows its Belly in, relative to
 * its centre, where its type's look puts it: by its top left corner and its
 * size.
 */
function bellyWindow(width: number, height: number, place: BellyPlace): Box {
  const w = place.width * width;
  const h = place.height * height;
  return { x: -w / 2, y: place.drop * height - h / 2, width: w, height: h };
}
