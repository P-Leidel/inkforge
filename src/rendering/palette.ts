/** Colours of the sandbox, as 0xRRGGBB. One neutral ink material in milestone 1. */
export const PALETTE = {
  background: 0x1d2027,
  terrainFill: 0x343944,
  terrainEdge: 0x4f5666,
  ink: 0xe8e2d0,
  objectFill: 0xb9b3a2,
  frozenFill: 0x8ea9c9,
  frozenPin: 0x2d6fd6,
  closeMarker: 0x62d98b,
  rejected: 0xff5a5a,
  debug: 0x39ff88,
  text: '#e8e2d0',
  textMuted: '#9aa0ad',
  running: '#62d98b',
  paused: '#f0c05a',
} as const;

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
