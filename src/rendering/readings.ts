import { LONG_FRAME_MS, SLOW_FRAME_MS, type FrameTimes, type RecentSummary } from './frame-times';

/** How many of each kind of thing the Sandbox world holds. */
export interface BodyCounts {
  /** Physics bodies, all kinds together. */
  readonly total: number;
  readonly pieces: number;
  readonly objects: number;
  readonly rubble: number;
  readonly droplets: number;
  readonly patches: number;
  readonly blasts: number;
  /** Debris particles: drawn only, no bodies. */
  readonly debris: number;
}

/** What the renderer has to draw each frame. */
export interface RenderLoad {
  /** Visible Graphics objects, and the commands they replay every frame. */
  readonly graphics: number;
  readonly commands: number;
  /** Visible Text objects: each its own texture. */
  readonly texts: number;
  /** Everything on the display list. */
  readonly objects: number;
}

/** Everything the F1 stats panel shows. */
export interface Readings {
  readonly recent: RecentSummary | null;
  readonly sinceStart: FrameTimes;
  readonly bodies: BodyCounts;
  readonly render: RenderLoad;
}

const number = (n: number) => n.toLocaleString('en-US');
const ms = (n: number | null) => (n === null ? '-' : `${n.toFixed(1)} ms`);
const fps = (n: number | null, digits = 0) => (n === null ? '-' : `${n.toFixed(digits)} fps`);

/** The readings as lines of text, for the panel and for pasting into an issue. */
export function readingLines({ recent, sinceStart, bodies, render }: Readings): string[] {
  const phase = ({ mean, max }: { mean: number; max: number }) =>
    `${mean.toFixed(1)} (max ${max.toFixed(1)})`;
  const row = (label: string, text: string) => label.padEnd(13) + text;
  return [
    row('last 1 s', recent ? `${fps(recent.fps)}   longest ${ms(recent.longestMs)}` : '-'),
    row(
      'since start',
      `${fps(sinceStart.averageFps, 1)}   longest ${ms(sinceStart.longestMs)}   ` +
        `1% low ${fps(sinceStart.onePercentLowFps)}`,
    ),
    row(
      '',
      `${number(sinceStart.frames)} frames   >${SLOW_FRAME_MS} ms: ${number(sinceStart.slowFrames)}   ` +
        `>${LONG_FRAME_MS} ms: ${number(sinceStart.longFrames)}`,
    ),
    row(
      'ms, last 1 s',
      recent ? `physics ${phase(recent.physicsMs)}   draw ${phase(recent.drawMs)}` : '-',
    ),
    row('', recent ? `render ${phase(recent.renderMs)}   steps ${recent.steps}` : ''),
    row(
      'bodies',
      `${number(bodies.total)}: Pieces ${bodies.pieces}   Objects ${bodies.objects}   Rubble ${bodies.rubble}`,
    ),
    row(
      '',
      `Droplets ${bodies.droplets}   Patches ${bodies.patches}   Blasts ${bodies.blasts}   ` +
        `Debris ${bodies.debris}`,
    ),
    row(
      'render',
      `Graphics ${render.graphics} · ${number(render.commands)} commands   Text ${render.texts}   ` +
        `objects ${number(render.objects)}`,
    ),
  ];
}
