import { describe, expect, it } from 'vitest';
import { CardViewer, type Card } from './cards';

const card = (title: string): Card => ({ title, body: '', swatches: [] });
const CARDS = [card('One'), card('Two'), card('Three')];

describe('The Card viewer', () => {
  it('opens a list at its first Card', () => {
    const viewer = new CardViewer();

    viewer.show(CARDS);

    expect(viewer.shown).toEqual({ card: CARDS[0], index: 0, count: 3 });
  });

  it('turns Card by Card and closes after the last', () => {
    const viewer = new CardViewer();
    viewer.show(CARDS);

    viewer.next();
    viewer.next();
    expect(viewer.shown?.card).toBe(CARDS[2]);
    viewer.next();

    expect(viewer.isOpen).toBe(false);
    expect(viewer.shown).toBeNull();
  });

  it('closes at once from any Card', () => {
    const viewer = new CardViewer();
    viewer.show(CARDS);
    viewer.next();

    viewer.close();

    expect(viewer.isOpen).toBe(false);
  });

  it('opens nothing for an empty list', () => {
    const viewer = new CardViewer();

    viewer.show([]);

    expect(viewer.isOpen).toBe(false);
  });
});
