import { element } from './dom';
import { LONG_FRAME_MS, type FrameRecord } from './frame-times';

/** The graph's height covers frames up to this long; longer ones get a red cap. */
const GRAPH_MAX_MS = 50;
const GRAPH_HEIGHT = 80;
/** Each frame's bar, px. */
const BAR_WIDTH = 2;
/** Where each frame's time went, bottom to top. */
const PHASES = [
  { name: 'physics', color: '#62d98b' },
  { name: 'draw', color: '#5aa9ff' },
  { name: 'render', color: '#ffc15a' },
  { name: 'other', color: '#6f7684' },
] as const;
const OVER_COLOR = '#ff5a5a';
const GUIDE_COLOR = 'rgba(232, 226, 208, 0.45)';

/**
 * The F1 stats panel: the readings as text and the recent frames as a graph
 * of stacked bars (physics, draw, render and the rest), with guides at 60 fps
 * and at 33 ms. A plain HTML overlay (styles in index.html) on a 2D canvas,
 * so showing it costs the WebGL renderer nothing. It sits over the game's
 * top-left corner, under the palette.
 */
export class StatsPanel {
  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly graph: HTMLCanvasElement;
  private readonly status: HTMLElement;

  constructor(onCopy: () => void) {
    this.root = element('div', 'stats-panel');
    this.root.hidden = true;
    this.text = element('pre', 'stats-text');
    this.graph = element('canvas', 'stats-graph');
    const legend = element('div', 'stats-legend');
    for (const { name, color } of PHASES) {
      const key = element('span', 'stats-key');
      key.style.background = color;
      legend.append(key, name);
    }
    legend.append(`   guides: 60 fps, ${LONG_FRAME_MS} ms`);
    const footer = element('div', 'stats-footer');
    const copy = element('button', '', 'Copy readings (F3)');
    copy.addEventListener('click', () => {
      // Keys go back to the game, so Space doesn't press the button again.
      copy.blur();
      onCopy();
    });
    this.status = element('span', 'stats-status');
    footer.append(copy, this.status, element('span', 'stats-hint', 'F1: stats → debug → off'));
    this.root.append(this.text, this.graph, legend, footer);
    // Phaser also listens for mouse presses on the window, so a click on the
    // panel would otherwise start a Stroke under it.
    for (const type of ['mousedown', 'mouseup'] as const) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    document.body.append(this.root);
  }

  set shown(shown: boolean) {
    this.root.hidden = !shown;
  }

  /**
   * Shows `lines` and the graph of `frames` (oldest first), with the panel's
   * top-left corner at `at`, in page px.
   */
  show(
    lines: readonly string[],
    frames: readonly FrameRecord[],
    at: { x: number; y: number },
  ): void {
    this.root.style.left = `${Math.round(at.x)}px`;
    this.root.style.top = `${Math.round(at.y)}px`;
    this.text.textContent = lines.join('\n');
    this.drawGraph(frames);
  }

  /** Shows a short message by the copy button for a moment. */
  say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 1500);
  }

  destroy(): void {
    this.root.remove();
  }

  private drawGraph(frames: readonly FrameRecord[]): void {
    const canvas = this.graph;
    const scale = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (canvas.width !== Math.round(width * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(GRAPH_HEIGHT * scale);
    }
    // A CPU-backed canvas: a GPU-backed one competes with the game's WebGL.
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, width, GRAPH_HEIGHT);
    const y = (ms: number) =>
      GRAPH_HEIGHT - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * GRAPH_HEIGHT;
    // Newest on the right.
    const first = Math.max(0, frames.length - Math.floor(width / BAR_WIDTH));
    frames.slice(first).forEach((frame, k) => {
      const x = width - (frames.length - first - k) * BAR_WIDTH;
      const other = Math.max(0, frame.ms - frame.physicsMs - frame.drawMs - frame.renderMs);
      let below = 0;
      [frame.physicsMs, frame.drawMs, frame.renderMs, other].forEach((ms, phase) => {
        g.fillStyle = PHASES[phase]!.color;
        g.fillRect(x, y(below + ms), BAR_WIDTH - 0.5, y(below) - y(below + ms));
        below += ms;
      });
      if (frame.ms > GRAPH_MAX_MS) {
        g.fillStyle = OVER_COLOR;
        g.fillRect(x, 0, BAR_WIDTH - 0.5, 3);
      }
    });
    g.fillStyle = GUIDE_COLOR;
    for (const ms of [1000 / 60, LONG_FRAME_MS]) g.fillRect(0, Math.round(y(ms)), width, 1);
  }
}
