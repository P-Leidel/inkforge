import type Phaser from 'phaser';
import type { Rect } from './tiles';

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

/** Texture memory held by baked drawings and atlas pages, for the F1 panel. */
const use = { textures: 0, bytes: 0 };

/** How many textures baked looks and drawings hold, and their memory, bytes. */
export function bakedTextureUse(): { readonly textures: number; readonly bytes: number } {
  return { ...use };
}

let freshKeys = 0;

/** A texture key not yet taken: textures outlive the scene, so a scene started again takes new names. */
function freshKey(scene: Phaser.Scene, prefix: string): string {
  let key: string;
  do key = `${prefix}:${freshKeys++}`;
  while (scene.textures.exists(key));
  return key;
}

/** A Graphics to draw a look into, at the scale it is baked at. Destroy it after baking. */
export function bakingGraphics(scene: Phaser.Scene): Graphics {
  return scene.make.graphics({}, false).setScale(SUPERSAMPLE);
}

/**
 * A drawing baked into a texture of its own that covers `rect` of the
 * drawing's space, shown by `image`. Place the image where the drawing's
 * origin goes: it rotates about that point. Bake it again when its look
 * changes; drawings that share a look belong in BakedTextures instead.
 *
 * Tiles of one drawing meet without a seam as long as their images stay
 * unrotated at whole px: each screen pixel then samples texels of one tile.
 */
export class BakedDrawing {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.DynamicTexture;
  private readonly bytes: number;

  constructor(
    scene: Phaser.Scene,
    private readonly rect: Rect,
  ) {
    const width = rect.width * SUPERSAMPLE;
    const height = rect.height * SUPERSAMPLE;
    const key = freshKey(scene, 'drawing');
    this.texture = scene.textures.addDynamicTexture(key, width, height)!;
    this.image = scene.add
      .image(0, 0, key)
      .setScale(1 / SUPERSAMPLE)
      .setDisplayOrigin(-rect.x * SUPERSAMPLE, -rect.y * SUPERSAMPLE);
    this.bytes = 4 * width * height;
    use.textures++;
    use.bytes += this.bytes;
  }

  /** Replaces what the texture shows with `g`, a Graphics from bakingGraphics. */
  bake(g: Graphics): void {
    this.texture
      .clear()
      .draw(g, -this.rect.x * SUPERSAMPLE, -this.rect.y * SUPERSAMPLE)
      .render();
  }

  destroy(): void {
    this.image.destroy();
    this.texture.destroy();
    use.textures--;
    use.bytes -= this.bytes;
  }
}

/**
 * Looks drawn once into WebGL textures and shared by every Image that looks
 * the same. Phaser replays a Graphics object's commands every frame; an Image
 * of a baked look is one quad.
 *
 * All looks share one atlas page (more only if it fills up). Phaser 4 builds
 * a shader for each number of textures a batch of Images uses, the first time
 * it meets that number, which stalls the frame; with one texture for every
 * look, a run of baked Images is always one texture. Looks are kept until
 * the scene ends.
 */
export class BakedTextures {
  /** The atlas page each look is on, by its key. */
  private readonly pages = new Map<string, string>();
  private readonly allPages: Phaser.Textures.DynamicTexture[] = [];
  /** The page new looks go on. */
  private page: Phaser.Textures.DynamicTexture | null = null;
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
    const g = bakingGraphics(this.scene);
    draw(g);
    page.draw(g, x + size / 2, y + size / 2).render();
    g.destroy();
    this.pages.set(key, page.key);
  }

  /** Frees the atlas pages. Images of them must be destroyed first. */
  destroy(): void {
    for (const page of this.allPages) {
      use.textures--;
      use.bytes -= 4 * page.width * page.height;
      page.destroy();
    }
    this.allPages.length = 0;
    this.pages.clear();
    this.page = null;
  }

  /**
   * Room for a look `size` px square: along the shelf, on a new shelf, or on
   * a new page. A look too big for a page gets a page of its own.
   */
  private place(size: number): { page: Phaser.Textures.DynamicTexture; x: number; y: number } {
    if (size + 2 * GUTTER > PAGE_SIZE) {
      return { page: this.addPage(size + 2 * GUTTER), x: GUTTER, y: GUTTER };
    }
    if (this.page && this.shelf.x + size + GUTTER > PAGE_SIZE) {
      this.shelf = { x: 0, y: this.shelf.y + this.shelf.height, height: 0 };
    }
    if (!this.page || this.shelf.y + size + GUTTER > PAGE_SIZE) {
      this.page = this.addPage(PAGE_SIZE);
      this.shelf = { x: 0, y: 0, height: 0 };
    }
    const x = this.shelf.x + GUTTER;
    const y = this.shelf.y + GUTTER;
    this.shelf.x += size + GUTTER;
    this.shelf.height = Math.max(this.shelf.height, size + GUTTER);
    return { page: this.page, x, y };
  }

  private addPage(size: number): Phaser.Textures.DynamicTexture {
    const page = this.scene.textures.addDynamicTexture(freshKey(this.scene, 'baked'), size, size)!;
    this.allPages.push(page);
    use.textures++;
    use.bytes += 4 * size * size;
    return page;
  }
}
