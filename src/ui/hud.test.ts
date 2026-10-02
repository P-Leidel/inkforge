import { describe, expect, it } from 'vitest';
import { helpText } from './hud';

describe("The HUD's help line", () => {
  it('offers the Eraser and sending in Enemies in Free play', () => {
    const help = helpText({ eraser: true, spawning: true });

    expect(help).toContain('E: eraser');
    expect(help).toContain('Shift+1–3: Enemy');
  });

  it('leaves out what is put away, and keeps the rest', () => {
    const help = helpText({ eraser: false, spawning: false });

    expect(help).not.toContain('eraser');
    expect(help).not.toContain('Shift');
    expect(help).toBe(
      '1–5: Colour    Drag: draw    Click: fill    Right-click: release    Space: run / pause    R: reset    Ctrl+Z: undo    F1: stats / debug    F2: tuning',
    );
  });
});
