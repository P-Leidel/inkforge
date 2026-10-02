import type { Colour } from '../materials/colour';
import type { CampaignStore } from './campaign';

/** One card of the Tutorial: its title, its text, and the Colours it shows a swatch of. */
export interface TutorialCard {
  readonly title: string;
  readonly body: string;
  readonly swatches: readonly { readonly colour: Colour; readonly label: string }[];
}

/**
 * The Tutorial's cards, in order: the goal, the controls (drawing a Line,
 * closing an Object, Fill and Release), how to kill an Enemy, what an
 * Enemy's Belly spills, and grey vs black.
 */
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
    title: 'Draw',
    body:
      'Pick a Colour with 1–5 and drag to draw. A stroke whose end does not come back ' +
      'to its start is a Line: it stays fixed exactly where you drew it, even in mid-air, ' +
      'until Enemies wear it down. Lines are your walls and ramps. Ctrl+Z undoes.',
    swatches: [],
  },
  {
    title: 'Close it into an Object',
    body:
      'Bring a stroke back to its start, until the marker shows, and it becomes an ' +
      'Object: a solid body with exactly the shape you drew. It must not cross itself, ' +
      'and may touch Terrain and other Objects but not overlap them. Every Object ' +
      'starts Frozen, hanging where you drew it.',
    swatches: [],
  },
  {
    title: 'Fill and Release',
    body:
      'Click inside an Object to fill it with the picked Colour: the Fill gives it its ' +
      'weight. Right-click a Frozen Object to Release it and let it fall. A hard hit ' +
      'frees it too.',
    swatches: [],
  },
  {
    title: 'Crush them',
    body:
      'Walls only hold Enemies back, and they wear through them. To kill an Enemy, hit ' +
      'it hard: hang a filled Object above their path and Release it as they pass ' +
      'beneath. The heavier and faster it falls, the harder it hits. Long falls hurt ' +
      'Enemies too.',
    swatches: [],
  },
  {
    title: 'Full of ink',
    body:
      'Every Enemy is full of one Colour of ink, which you can see in its belly. When ' +
      'it dies in the Arena the ink spills out, just as a broken Object lets out its ' +
      'Fill: grey and black tumble out as pebbles and stones, blue and green splash, ' +
      'and red explodes. Pick which one to kill, and where.',
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
