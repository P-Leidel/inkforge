import { describe, expect, it } from 'vitest';
import { isFillClick } from './fill-click';
import { dragAlong } from './pointer-paths';

describe('Telling a Fill click from a Stroke', () => {
  it('takes a press and release without moving for a click', () => {
    expect(isFillClick([{ x: 300, y: 300 }])).toBe(true);
  });

  it('takes a press that wobbles by a few pixels for a click', () => {
    expect(
      isFillClick([
        { x: 300, y: 300 },
        { x: 303, y: 301 },
        { x: 301, y: 304 },
        { x: 300, y: 302 },
      ]),
    ).toBe(true);
  });

  it('counts the pointer movement along the way, not just from start to end', () => {
    // 20 px out and back again ends where it started, but moved 40 px.
    expect(
      isFillClick(
        dragAlong([
          { x: 300, y: 300 },
          { x: 320, y: 300 },
          { x: 300, y: 300 },
        ]),
      ),
    ).toBe(false);
  });

  it('takes 16 px of movement or more for a Stroke', () => {
    const drag = (length: number) =>
      dragAlong([
        { x: 300, y: 300 },
        { x: 300 + length, y: 300 },
      ]);

    expect(isFillClick(drag(15))).toBe(true);
    expect(isFillClick(drag(16))).toBe(false);
    expect(isFillClick(drag(200))).toBe(false);
  });
});
