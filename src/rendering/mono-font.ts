import Phaser from 'phaser';

/** Every printable ASCII character, and the few others the overlay writes. */
const CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·×→';
const FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Makes a monospace bitmap font, once per game: white glyphs (tint them) in
 * one small texture, uploaded once. BitmapText in it costs no texture upload
 * when its text changes, and all of it batches as one texture, unlike a Text,
 * which is a canvas re-rendered and re-uploaded on every change. `backing`
 * fills each glyph cell, so a row of glyphs reads as a label on its own.
 * Returns the font's key.
 */
export function addMonoFont(
  scene: Phaser.Scene,
  key: string,
  size: number,
  backing: string | null = null,
): string {
  if (scene.cache.bitmapFont.exists(key)) return key;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `${size}px ${FAMILY}`;
  const width = Math.ceil(measure.measureText('M').width);
  const height = Math.ceil(size * 1.25);
  const perRow = 32;
  const rows = Math.ceil(CHARS.length / perRow);
  const texture = scene.textures.createCanvas(key, width * perRow, height * rows)!;
  const g = texture.getContext();
  g.font = `${size}px ${FAMILY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...CHARS].forEach((char, k) => {
    const x = (k % perRow) * width;
    const y = Math.floor(k / perRow) * height;
    if (backing) {
      g.fillStyle = backing;
      g.fillRect(x, y, width, height);
    }
    g.fillStyle = '#ffffff';
    g.fillText(char, x + width / 2, y + height / 2 + 1);
  });
  texture.refresh();
  scene.cache.bitmapFont.add(
    key,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: key,
      width,
      height,
      chars: CHARS,
      charsPerRow: perRow,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    }),
  );
  return key;
}
