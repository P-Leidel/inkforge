import type Phaser from 'phaser';
import { textButton } from './text-button';

/** Space between the menu's button and its items, and between items. */
const GAP = 4;

/** One entry of a Menu. */
export interface MenuItem {
  readonly label: string;
  readonly onPick: () => void;
}

/**
 * A button that drops a list of items down beneath it, right-aligned under
 * it and all as wide as the widest. Picking an item closes the list, and so
 * does clicking the button again. Hidden items take no clicks.
 */
export class Menu {
  private readonly button: Phaser.GameObjects.Text;
  private readonly items: Phaser.GameObjects.Text[];
  private open = false;

  /** (`right`, `top`): the button's top-right corner. */
  constructor(
    scene: Phaser.Scene,
    right: number,
    top: number,
    private readonly label: string,
    items: readonly MenuItem[],
  ) {
    this.button = textButton(scene, right, top, this.caption(), () => this.toggle());
    let y = top + this.button.height + GAP;
    this.items = items.map((item) => {
      const button = textButton(scene, right, y, item.label, () => {
        this.close();
        item.onPick();
      })
        .setDepth(70)
        .setVisible(false);
      y += button.height + GAP;
      return button;
    });
    const width = Math.max(this.button.width, ...this.items.map((item) => item.width));
    for (const item of this.items) item.setFixedSize(width, 0);
  }

  /** The button's width, for laying out what sits beside it. */
  get width(): number {
    return this.button.width;
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.show(!this.open);
  }

  close(): void {
    this.show(false);
  }

  private show(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.button.setText(this.caption());
    for (const item of this.items) item.setVisible(open);
  }

  private caption(): string {
    return `${this.label} ${this.open ? '▴' : '▾'}`;
  }
}
