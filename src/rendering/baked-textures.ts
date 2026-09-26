import type Phaser from 'phaser';

type Graphics = Phaser.GameObjects.Graphics;

/**
 * Drawings baked at this many texture pixels per game pixel and shown scaled
 * down by as much. A WebGL framebuffer isn't antialiased, so this is what
 * smooths the edges; it also keeps them sharp as the Image rotates.
 */
const SUPERSAMPLE = 2;
/** Room around the drawing for its antialiased edge, game px. */
const PAD = 1;
/** Side of each atlas page, texture px. */
const PAGE_SIZE = 1024;
/** Empty texture px between looks, so filtering never picks up a neighbour. */
const GUTTER = 2;

/**
 * Looks drawn once into WebGL textures and shared by every Image that looks
 * the same. Phaser replays a Graphics object's commands every frame; an Image
 * of a baked look is one quad.
 *
 * All looks share one atlas page (more only if it fills up). Phaser 4 builds
 * a shader for each number of textures a batch of Images uses, the first time
 * it meets that number, which stalls the frame; with one texture for every
 * look, a run of baked Images is always one texture. Looks are kept for the
 * rest of the game: there are only a few.
 */
export class BakedTextures {
  /** The atlas page each look is on, by its key. */
  private readonly pages = new Map<string, string>();
  private page: Phaser.Textures.DynamicTexture | null = null;
  private pageCount = 0;
  /** Where the next look goes on the page: along the current shelf. */
  private shelf = { x: 0, y: 0, height: 0 };

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * An Image of the look named `key`, centred on its origin like the drawing.
   * The first time a key is asked for, `draw` draws the look around (0, 0),
   * within `extent` px of it, into a Graphics that is baked and thrown away.
   */
  image(key: string, extent: number, draw: (g: Graphics) => void): Phaser.GameObjects.Image {
    this.prepare(key, extent, draw);
    return this.scene.add.image(0, 0, this.pages.get(key)!, key).setScale(1 / SUPERSAMPLE);
  }

  /**
   * Bakes the look named `key` now if it isn't yet. The first bake in a game
   * sets up drawing into textures, which can take a moment, so bake the looks
   * a scene will need while it loads.
   */
  prepare(key: string, extent: number, draw: (g: Graphics) => void): void {
    if (this.pages.has(key)) return;
    const size = Math.ceil(2 * (extent + PAD) * SUPERSAMPLE);
    const { page, x, y } = this.place(size);
    page.add(key, 0, x, y, size, size);
    const g = this.scene.make.graphics({}, false).setScale(SUPERSAMPLE);
    draw(g);
    page.draw(g, x + size / 2, y + size / 2).render();
    g.destroy();
    this.pages.set(key, page.key);
  }

  /** Room for a look `size` px square: along the shelf, on a new shelf, or on a new page. */
  private place(size: number): { page: Phaser.Textures.DynamicTexture; x: number; y: number } {
    if (size + GUTTER > PAGE_SIZE) throw new Error(`A baked look of ${size} px is too big`);
    if (this.page && this.shelf.x + size + GUTTER > PAGE_SIZE) {
      this.shelf = { x: 0, y: this.shelf.y + this.shelf.height, height: 0 };
    }
    if (!this.page || this.shelf.y + size + GUTTER > PAGE_SIZE) {
      // Textures outlive the scene, so a scene started again takes new names.
      let key: string;
      do key = `baked:${this.pageCount++}`;
      while (this.scene.textures.exists(key));
      this.page = this.scene.textures.addDynamicTexture(key, PAGE_SIZE, PAGE_SIZE)!;
      this.shelf = { x: 0, y: 0, height: 0 };
    }
    const x = this.shelf.x + GUTTER;
    const y = this.shelf.y + GUTTER;
    this.shelf.x += size + GUTTER;
    this.shelf.height = Math.max(this.shelf.height, size + GUTTER);
    return { page: this.page, x, y };
  }
}
