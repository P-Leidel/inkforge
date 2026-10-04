/** Colours of the sandbox interface, as 0xRRGGBB. The inks' own hues are in ink.ts. */
export const PALETTE = {
  background: 0x1d2027,
  terrainFill: 0x343944,
  terrainEdge: 0x4f5666,
  frozenPin: 0xf2f2f2,
  frozenPinEdge: 0x1d2027,
  closeMarker: 0x62d98b,
  selection: 0xf0c05a,
  /** The Eraser's brush. */
  eraser: 0xe8e2d0,
  rejected: 0xff5a5a,
  debug: 0x39ff88,
  /** The arrow at the Spawn edge where Enemies come in. */
  spawn: 0xf0c05a,
  /** A Crawler's body and outline, placeholder art. */
  crawler: 0x7a6450,
  crawlerEdge: 0x3e3127,
  /** A Runner's, placeholder art: lighter and warmer than a Crawler. */
  runner: 0xb08a5a,
  runnerEdge: 0x5a4128,
  /** A Heavy's, placeholder art: dark. */
  heavy: 0x3a3634,
  heavyEdge: 0x151312,
  /** A Siege Walker's, placeholder art: a dark rust red, bigger than everything else. */
  siegeWalker: 0x5a2a24,
  siegeWalkerEdge: 0x1e0d0b,
  enemyEye: 0xf2e6c8,
  /** The Ink Core: a glowing block. */
  core: 0x6fe3ff,
  coreEdge: 0xe8fbff,
  coreGlow: 0x6fe3ff,
  /** An HP bar's empty part, and its full part while whole and once low. */
  hpEmpty: 0x16171b,
  hpFull: 0x62d98b,
  hpLow: 0xff5a5a,
  crack: 0x16171b,
  /** Cracks on black ink, which a dark crack wouldn't show on. */
  crackOnBlack: 0xc9ced8,
  text: '#e8e2d0',
  textMuted: '#9aa0ad',
  running: '#62d98b',
  paused: '#f0c05a',
  /** "Ink Core destroyed". */
  destroyed: '#ff5a5a',
  /** The phase label, with Waves on. */
  intermission: '#6fe3ff',
  wave: '#ff9a5a',
  cleared: '#62d98b',
  lost: '#ff5a5a',
  /** The number still to come, beside the Spawn arrow. */
  spawnCount: '#f0c05a',
} as const;

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
