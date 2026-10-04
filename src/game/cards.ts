import type { Colour } from '../materials/colour';

/**
 * A Card (CONTEXT.md): a page of teaching text a Level shows in an
 * Intermission, before the Wave it teaches. Its title, its text, and the
 * Colours it shows a swatch of.
 */
export interface Card {
  readonly title: string;
  readonly body: string;
  readonly swatches: readonly { readonly colour: Colour; readonly label: string }[];
}

/**
 * The Cards shown over the Arena: `show` opens a list at its first Card,
 * `next` turns to the next and closes after the last, `close` closes at once.
 */
export class CardViewer {
  private cards: readonly Card[] = [];
  /** The Card shown, from 0; null while closed. */
  private index: number | null = null;

  get isOpen(): boolean {
    return this.index !== null;
  }

  /** The Card shown and where it stands, or null while closed. */
  get shown(): {
    readonly card: Card;
    readonly index: number;
    readonly count: number;
  } | null {
    if (this.index === null) return null;
    return { card: this.cards[this.index]!, index: this.index, count: this.cards.length };
  }

  /** Opens `cards` at the first; an empty list opens nothing. */
  show(cards: readonly Card[]): void {
    if (cards.length === 0) return;
    this.cards = cards;
    this.index = 0;
  }

  /** Turns to the next Card; after the last, closes. */
  next(): void {
    if (this.index === null) return;
    if (this.index + 1 < this.cards.length) this.index += 1;
    else this.close();
  }

  close(): void {
    this.index = null;
  }
}
