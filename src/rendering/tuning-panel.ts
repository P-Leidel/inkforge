import type { Game } from '../game/game';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import { COLOURS, type Colour } from '../materials/colour';
import {
  DEFAULT_MATERIAL_TABLE,
  editMaterials,
  type MaterialTable,
} from '../materials/material-table';
import { numberPaths, readPath, writePath } from '../materials/table-paths';
import { element } from './dom';
import { tablesAsJson } from './tuning-copy';

/** A table the panel edits: the table, its defaults in the code, and how an edit reaches it. */
interface Tuned {
  readonly table: object;
  readonly defaults: object;
  edit(write: (table: object) => void): void;
}

/** One row of a per-Colour grid: its label, and the path of its value for each Colour. */
interface ColourRow {
  readonly label: string;
  path(colour: Colour): string[];
}

/**
 * The F2 tuning panel. Its Ink section holds the **Ink costs** switch and
 * the Game's Ink table: the prices and the Tank maximums. Below it is every
 * number of the material table. All are editable while the sandbox runs,
 * and "Copy as JSON" copies both tables to paste back over their defaults in
 * the code. It lists whatever the tables hold, so values added later appear
 * without changes here. Edits go straight into the tables the Game and the
 * Sandbox world read, so they survive R and Clear.
 *
 * A plain HTML overlay (styles in index.html). Keys typed into it don't reach
 * the game; clicking the game gives the keys back.
 */
export class TuningPanel {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly materials: Tuned;
  private readonly ink: Tuned;
  private readonly inputs: { tuned: Tuned; path: string[]; input: HTMLInputElement }[] = [];
  /** Clicking the game gives the keys back to it. */
  private readonly giveKeysBack = (event: PointerEvent) => {
    if (!this.root.contains(event.target as Node)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  constructor(
    private readonly table: MaterialTable,
    /** Where the Ink costs switch and the Ink table's edits go. */
    private readonly game: Pick<Game, 'inkCosts' | 'ink' | 'editInk'>,
  ) {
    this.materials = {
      table,
      defaults: DEFAULT_MATERIAL_TABLE,
      edit: (write) => editMaterials(table, write),
    };
    // Through the Game, which empties a Tank down to a lowered maximum at once.
    this.ink = {
      table: game.ink,
      defaults: DEFAULT_INK_TABLE,
      edit: (write) => game.editInk(write),
    };

    this.root = element('div', 'tuning-panel');
    this.root.hidden = true;

    const header = element('div', 'tuning-header');
    header.append(element('span', 'tuning-title', 'Tuning (F2)'));
    const copy = element('button', '', 'Copy as JSON');
    copy.addEventListener('click', () => void this.copy());
    const defaults = element('button', '', 'Defaults');
    defaults.addEventListener('click', () => this.restoreDefaults());
    this.status = element('span', 'tuning-status');
    header.append(copy, defaults, this.status);
    this.root.append(
      header,
      element('div', 'tuning-section', 'Ink'),
      this.inkCosts(),
      this.colourGrid(this.ink, [
        { label: 'tank maximum (Line length)', path: (colour) => ['tanks', colour] },
      ]),
      this.sharedValues(this.ink, (path) => path[0] !== 'tanks'),
      element('div', 'tuning-section', 'Material table'),
      this.colourGrid(
        this.materials,
        numberPaths(table.colours[COLOURS[0]]).map((row) => ({
          label: row.join(' '),
          path: (colour) => ['colours', colour, ...row],
        })),
      ),
      this.sharedValues(this.materials, (path) => path[0] !== 'colours'),
    );

    // Phaser also listens for mouse presses on the window, so a click on the
    // panel would otherwise hit whatever game button lies under it.
    for (const type of ['mousedown', 'mouseup'] as const) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    // Typing into the panel must not draw, pick Colours or pause the game.
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur();
      if (event.key !== 'F2') event.stopPropagation();
    });
    window.addEventListener('pointerdown', this.giveKeysBack, true);
    document.body.append(this.root);
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.giveKeysBack, true);
    this.root.remove();
  }

  /**
   * The Ink costs switch, off by default: off, Ink is unlimited. Switching
   * leaves the Tanks as they are. Not a table value: Defaults leaves it.
   */
  private inkCosts(): HTMLElement {
    const row = element('label', 'tuning-ink');
    const box = element('input');
    box.type = 'checkbox';
    box.checked = this.game.inkCosts;
    box.addEventListener('change', () => (this.game.inkCosts = box.checked));
    row.append(box, element('span', '', 'Ink costs (off: Ink is unlimited)'));
    return row;
  }

  /** Per-Colour values as a grid: one row per value, one column per Colour. */
  private colourGrid(tuned: Tuned, rows: readonly ColourRow[]): HTMLElement {
    const grid = element('table', 'tuning-grid');
    const head = element('tr');
    head.append(element('th'));
    for (const colour of COLOURS) head.append(element('th', `tuning-colour ${colour}`, colour));
    grid.append(head);
    for (const row of rows) {
      const tr = element('tr');
      tr.append(element('th', 'tuning-label', row.label));
      for (const colour of COLOURS) {
        const cell = element('td');
        cell.append(this.input(tuned, row.path(colour)));
        tr.append(cell);
      }
      grid.append(tr);
    }
    return grid;
  }

  /** The values of `tuned` that `shown` picks, one per row. */
  private sharedValues(tuned: Tuned, shown: (path: string[]) => boolean): HTMLElement {
    const list = element('table', 'tuning-grid');
    for (const path of numberPaths(tuned.table)) {
      if (!shown(path)) continue;
      const tr = element('tr');
      tr.append(element('th', 'tuning-label', path.join(' ')));
      const cell = element('td');
      cell.append(this.input(tuned, path));
      tr.append(cell);
      list.append(tr);
    }
    return list;
  }

  private input(tuned: Tuned, path: string[]): HTMLInputElement {
    const input = element('input');
    input.type = 'number';
    input.step = 'any';
    input.value = String(readPath(tuned.table, path));
    input.title = path.join('.');
    input.addEventListener('input', () => {
      const value = Number(input.value);
      const valid = input.value.trim() !== '' && Number.isFinite(value);
      input.classList.toggle('invalid', !valid);
      if (valid) tuned.edit((table) => writePath(table, path, value));
      this.markModified(tuned, path, input);
    });
    this.inputs.push({ tuned, path, input });
    this.markModified(tuned, path, input);
    return input;
  }

  /** Highlights a value that differs from the code's default. */
  private markModified(tuned: Tuned, path: string[], input: HTMLInputElement): void {
    const changed = readPath(tuned.table, path) !== readPath(tuned.defaults, path);
    input.classList.toggle('modified', changed);
  }

  private restoreDefaults(): void {
    for (const tuned of [this.materials, this.ink]) {
      const paths = this.inputs.filter((entry) => entry.tuned === tuned).map(({ path }) => path);
      tuned.edit((table) => {
        for (const path of paths) writePath(table, path, readPath(tuned.defaults, path));
      });
    }
    for (const { tuned, path, input } of this.inputs) {
      input.value = String(readPath(tuned.table, path));
      input.classList.remove('invalid');
      this.markModified(tuned, path, input);
    }
    this.say('Defaults restored');
  }

  private async copy(): Promise<void> {
    const json = tablesAsJson({ materials: this.table, ink: this.game.ink });
    try {
      await navigator.clipboard.writeText(json);
      this.say('Copied');
    } catch {
      // No clipboard access: show the JSON to copy by hand.
      window.prompt('Copy the material and Ink tables:', json);
    }
  }

  private say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 1500);
  }
}
