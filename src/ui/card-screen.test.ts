import { describe, expect, it } from 'vitest';
import { cardFooter } from './card-screen';

describe("A Card's footer", () => {
  it('says where the card stands and that Space or a click turns it', () => {
    expect(cardFooter(0, 3)).toBe('1 / 3    Space or click: next    Esc: skip');
  });

  it('says the last card closes', () => {
    expect(cardFooter(2, 3)).toContain('Space or click: close');
  });
});
