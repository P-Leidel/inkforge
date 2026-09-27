import type Phaser from 'phaser';
import { Menu, type MenuItem } from './menu';
import { textButton } from './text-button';

const MARGIN = 60;
const GAP = 10;

/** A row of text buttons along the top-right corner, laid out from the right. */
export class Toolbar {
  private right: number;

  /** `top`: y of the row's top edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly top = MARGIN,
  ) {
    this.right = scene.scale.width - MARGIN;
  }

  addButton(label: string, onClick: () => void): this {
    const button = textButton(this.scene, this.right, this.top, label, onClick);
    this.right -= button.width + GAP;
    return this;
  }

  /** A button that opens and closes a list of `items` dropping down beneath it. */
  addMenu(label: string, items: readonly MenuItem[]): Menu {
    const menu = new Menu(this.scene, this.right, this.top, label, items);
    this.right -= menu.width + GAP;
    return menu;
  }
}
