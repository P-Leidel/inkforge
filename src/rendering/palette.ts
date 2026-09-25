/** Colours of the sandbox interface, as 0xRRGGBB. The inks' own hues are in ink.ts. */
export const PALETTE = {
  background: 0x1d2027,
  terrainFill: 0x343944,
  terrainEdge: 0x4f5666,
  frozenPin: 0xf2f2f2,
  frozenPinEdge: 0x1d2027,
  closeMarker: 0x62d98b,
  selection: 0xf0c05a,
  rejected: 0xff5a5a,
  debug: 0x39ff88,
  text: '#e8e2d0',
  textMuted: '#9aa0ad',
  running: '#62d98b',
  paused: '#f0c05a',
} as const;

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
