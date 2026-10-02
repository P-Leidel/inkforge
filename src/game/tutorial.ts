import type { Colour } from '../materials/colour';
import type { CampaignStore } from './campaign';

/** One card of the Tutorial: its title, its text, and the Colours it shows a swatch of. */
export interface TutorialCard {
  readonly title: string;
  readonly body: string;
  readonly swatches: readonly { readonly colour: Colour; readonly label: string }[];
}

/** The Tutorial's cards, in order: the goal, how to kill an Enemy, and grey vs black. */
export const TUTORIAL_CARDS: readonly TutorialCard[] = [
  {
    title: 'Defend the Ink Core',
    body:
      'Enemies walk in from the left toward the Ink Core on the right. Each one that ' +
      'reaches it costs it HP, and if the HP hits zero the Wave is lost. Survive every ' +
      'Wave to clear the Level. You build your defences by drawing, and ink is scarce.',
    swatches: [],
  },
  {
    title: 'Crush them',
    body:
      'Walls only hold Enemies back, and they wear through them. To kill an Enemy, hit ' +
      'it hard. Draw a closed shape above their path and it hangs Frozen. Click inside ' +
      'it to fill it, then right-click to drop it on them. Long falls hurt too.',
    swatches: [],
  },
  {
    title: 'Pebble or stone?',
    body:
      'Grey is pebble: cheap and plentiful. It makes flimsy walls and light rocks that ' +
      'burst into pebbles. Black is stone: scarce, it makes the strongest walls and ' +
      'heavy rocks that hit hard and burst into heavy stones. Build with grey; save ' +
      'black for what must hold or must hit.',
    swatches: [
      { colour: 'grey', label: 'grey: pebble' },
      { colour: 'black', label: 'black: stone' },
    ],
  },
];

/** The `localStorage` key of whether the Tutorial has been seen. A new shape gets a new version. */
export const TUTORIAL_KEY = 'inkforge.tutorial.v1';

/** What the store holds once the Tutorial has been seen. */
const SEEN = 'seen';

/**
 * The Tutorial: the cards shown the first time Campaign Level 1 starts, and
 * again on H. `offer` opens it at card 1 if the Level just started is the
 * Campaign's first and it has not been seen; `open` opens it at card 1
 * whatever. `next` turns to the next card and closes it after the last;
 * `skip` closes it at once. Closing either way marks it seen, in `store` and
 * for the rest of the page, so where storage refuses it shows once a page
 * load. `hide` closes it unseen, as when a menu screen opens over it.
 */
export class Tutorial {
  /** The card shown, from 0; null while closed. */
  private index: number | null = null;
  /** Seen this page load, whether or not the store kept it. */
  private seenHere = false;

  constructor(
    private readonly store: CampaignStore,
    readonly cards: readonly TutorialCard[] = TUTORIAL_CARDS,
  ) {}

  get isOpen(): boolean {
    return this.index !== null;
  }

  /** The card shown and where it stands, or null while closed. */
  get shown(): {
    readonly card: TutorialCard;
    readonly index: number;
    readonly count: number;
  } | null {
    if (this.index === null) return null;
    return { card: this.cards[this.index]!, index: this.index, count: this.cards.length };
  }

  get seen(): boolean {
    return this.seenHere || this.store.read() === SEEN;
  }

  /**
   * A Level was started: `campaignIndex` is the Campaign Level's, from 0, or
   * null in Free play. Opens at card 1 on the Campaign's first Level, unless
   * already seen; returns whether it did.
   */
  offer(campaignIndex: number | null): boolean {
    if (campaignIndex !== 0 || this.seen) return false;
    this.open();
    return true;
  }

  /** Opens at card 1. */
  open(): void {
    this.index = 0;
  }

  /** Turns to the next card; after the last, closes and is seen. */
  next(): void {
    if (this.index === null) return;
    if (this.index + 1 < this.cards.length) this.index += 1;
    else this.skip();
  }

  /** Closes and is seen. */
  skip(): void {
    if (this.index === null) return;
    this.index = null;
    this.seenHere = true;
    this.store.write(SEEN);
  }

  /** Closes without being seen. */
  hide(): void {
    this.index = null;
  }
}
