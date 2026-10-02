import { describe, expect, it } from 'vitest';
import { tutorialFooter } from './tutorial-screen';

describe("The Tutorial card's footer", () => {
  it('says where the card stands and that Space or a click turns it', () => {
    expect(tutorialFooter(0, 3)).toBe(
      '1 / 3    Space or click: next    Esc: skip    H: show again',
    );
  });

  it('says the last card closes', () => {
    expect(tutorialFooter(2, 3)).toContain('Space or click: close');
  });
});
