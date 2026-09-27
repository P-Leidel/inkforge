import type { Bounds, Polygon } from '../geometry/polygon';
import type { EnemyTable } from '../materials/enemy-table';
import type { Arena } from './arena';
import type { ArenaBodies } from './arena-bodies';
import type { Kind } from './arena-contents';
import type { PartyId } from './contact-ledger';

/** The Ink Core as the renderer and the tests read it. */
export interface InkCoreView {
  /** HP left; it never goes below 0. */
  readonly hp: number;
  /** HP when whole, from the enemy table as it is now. */
  readonly fullHp: number;
  /** Where it stands. */
  readonly bounds: Bounds;
}

/** The Ink Core's part of a snapshot: its HP. Its body always stands where the Arena has it. */
interface SavedInkCore {
  readonly hp: number;
}

const blockOf = ({ minX, minY, maxX, maxY }: Bounds): Polygon => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

/**
 * The Ink Core: the fixed block the player defends, where the Arena has it,
 * and its HP. Only an Enemy reaching it damages it, as the Material rules
 * decide: hits, Blasts and Rubble don't. It is one Party to the Contact
 * ledger, with no target, the same after every rebuild. Its body stays
 * through Clear, like the Terrain, and Clear makes it whole again.
 */
export class InkCore implements Kind<'inkCore', SavedInkCore, InkCoreView> {
  readonly name = 'inkCore';
  private hp: number;
  private readonly party: PartyId;

  constructor(
    private readonly arena: Arena,
    private readonly enemies: EnemyTable,
    private readonly bodies: Pick<ArenaBodies<never>, 'newId' | 'addInkCore'>,
  ) {
    this.hp = enemies.coreHp;
    this.party = bodies.newId();
    this.addBody();
  }

  get views(): InkCoreView {
    return { hp: this.hp, fullHp: this.enemies.coreHp, bounds: this.arena.core };
  }

  private addBody(): void {
    this.bodies.addInkCore(blockOf(this.arena.core), this.party);
  }

  /** Whether this Party is the Ink Core. */
  is(party: PartyId): boolean {
    return party === this.party;
  }

  /** Takes `damage` off its HP, down to 0. */
  damage(damage: number): void {
    this.hp = Math.max(0, this.hp - damage);
  }

  save(): SavedInkCore {
    return { hp: this.hp };
  }

  restore(saved: SavedInkCore): void {
    this.hp = saved.hp;
    this.addBody();
  }

  /** Its body stays through Clear; it is whole again. */
  clear(): void {
    this.hp = this.enemies.coreHp;
  }

  /** Nothing is attached to it. */
  gone(): void {}

  step(): void {}
}
