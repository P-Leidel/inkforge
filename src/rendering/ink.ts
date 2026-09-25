import type Phaser from 'phaser';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';

type Graphics = Phaser.GameObjects.Graphics;

/**
 * How each Colour looks. Every Colour has its own texture as well as its hue,
 * so Colours can be told apart without seeing hue: grey is grainy, blue
 * glossy, green drippy, black thick and solid, red striped like a fuse.
 * Placeholder art.
 */
export const INK_HUES: Record<Colour, number> = {
  grey: 0x9d9a92,
  blue: 0x3b82f6,
  green: 0x44c05a,
  black: 0x050506,
  red: 0xe5483b,
};

const GRAIN_LIGHT = 0xd9d6cc;
const GRAIN_DARK = 0x5a5751;
const GLOSS = 0xeaf3ff;
const DRIP = 0x2c8a3e;
const BLACK_RIM = 0x8a909e;
const FUSE_STRIPE = 0x7a1a14;

/** A repeatable pseudo-random value in [0, 1) for pattern placement (not simulation). */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface PathPoint {
  readonly p: Vec2;
  /** Unit tangent. */
  readonly t: Vec2;
  /** Unit normal, the tangent turned 90° anticlockwise on screen. */
  readonly n: Vec2;
  readonly index: number;
}

/** Points every `spacing` px along a path, with its direction there. */
function pointsAlong(points: readonly Vec2[], closed: boolean, spacing: number): PathPoint[] {
  const out: PathPoint[] = [];
  const count = closed ? points.length : points.length - 1;
  let carry = spacing / 2;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const t = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const n = { x: t.y, y: -t.x };
    for (let d = carry; d < length; d += spacing) {
      out.push({ p: { x: a.x + t.x * d, y: a.y + t.y * d }, t, n, index: out.length });
    }
    carry = (carry - length) % spacing;
    if (carry < 0) carry += spacing;
  }
  return out;
}

/** A band of `width` along the path with round joints and ends. */
function band(
  g: Graphics,
  points: readonly Vec2[],
  closed: boolean,
  width: number,
  color: number,
  alpha: number,
) {
  g.lineStyle(width, color, alpha);
  g.fillStyle(color, alpha);
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (const p of points) g.fillCircle(p.x, p.y, width / 2);
}

/** Draws a stretch of ink along a path in its Colour's hue and texture. */
export function drawInk(
  g: Graphics,
  colour: Colour,
  points: readonly Vec2[],
  closed: boolean,
  width: number,
  alpha = 1,
): void {
  if (points.length === 0) return;
  const half = width / 2;
  if (colour === 'black') {
    // Thick and solid: a heavy dark core inside a pale rim, with no pattern.
    band(g, points, closed, width, BLACK_RIM, alpha);
    band(g, points, closed, Math.max(1, width - 2.5), INK_HUES.black, alpha);
    return;
  }
  band(g, points, closed, width, INK_HUES[colour], alpha);
  switch (colour) {
    case 'grey':
      // Grainy: light and dark specks scattered across the band.
      for (const { p, n, index } of pointsAlong(points, closed, 2.5)) {
        const across = (hash(index) - 0.5) * (width - 2);
        g.fillStyle(hash(index + 0.5) < 0.5 ? GRAIN_LIGHT : GRAIN_DARK, alpha);
        g.fillCircle(p.x + n.x * across, p.y + n.y * across, Math.max(0.6, width * 0.1));
      }
      break;
    case 'blue': {
      // Glossy: a highlight running along one side, with brighter glints.
      const shine = points.map((p, i) => {
        const a = points[Math.max(0, i - 1)]!;
        const b = points[Math.min(points.length - 1, i + 1)]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const off = half * 0.45;
        return { x: p.x + ((b.y - a.y) / length) * off, y: p.y - ((b.x - a.x) / length) * off };
      });
      band(g, shine, closed, Math.max(1, width * 0.22), GLOSS, 0.55 * alpha);
      for (const { p, n, t, index } of pointsAlong(points, closed, 16)) {
        if (hash(index) < 0.4) continue;
        const c = { x: p.x + n.x * half * 0.45, y: p.y + n.y * half * 0.45 };
        g.lineStyle(Math.max(1, width * 0.3), 0xffffff, 0.9 * alpha);
        g.lineBetween(c.x - t.x * 2, c.y - t.y * 2, c.x + t.x * 2, c.y + t.y * 2);
      }
      break;
    }
    case 'green':
      // Drippy: drops hanging below the ink.
      for (const { p, index } of pointsAlong(points, closed, 11)) {
        if (hash(index) < 0.35) continue;
        const r = width * (0.22 + 0.12 * hash(index + 0.3));
        const drop = half * 0.4 + r + width * 0.5 * hash(index + 0.7);
        g.fillStyle(INK_HUES.green, alpha);
        g.fillRect(p.x - r * 0.45, p.y, r * 0.9, drop);
        g.fillCircle(p.x, p.y + drop, r);
        g.fillStyle(DRIP, alpha);
        g.fillCircle(p.x - r * 0.25, p.y + drop + r * 0.2, r * 0.45);
      }
      break;
    case 'red':
      // A fuse: dark diagonal stripes wound around the ink.
      g.lineStyle(Math.max(1, width * 0.18), FUSE_STRIPE, alpha);
      for (const { p, n, t } of pointsAlong(points, closed, Math.max(3, width * 0.7))) {
        const s = half * 0.8;
        g.lineBetween(
          p.x + n.x * s - t.x * s,
          p.y + n.y * s - t.y * s,
          p.x - n.x * s + t.x * s,
          p.y - n.y * s + t.y * s,
        );
      }
      break;
  }
}

/** Joins a Line's segments into runs of connected points (a Line cut by Terrain has several). */
export function segmentRuns(segments: readonly Segment[]): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] | null = null;
  for (const { a, b } of segments) {
    const last = run?.[run.length - 1];
    if (run && last && Math.hypot(last.x - a.x, last.y - a.y) < 1e-6) {
      run.push(b);
    } else {
      run = [a, b];
      runs.push(run);
    }
  }
  return runs;
}
