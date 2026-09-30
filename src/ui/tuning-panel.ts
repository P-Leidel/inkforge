import type { Game } from '../game/game';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import { DEFAULT_WAVE_TABLE } from '../game/wave-table';
import { COLOURS } from '../materials/colour';
import {
  DEFAULT_ENEMY_TABLE,
  editEnemies,
  ENEMY_TYPES,
  type EnemyTable,
} from '../materials/enemy-table';
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

/** A column of a grid: a Colour or an Enemy type, and how its heading looks. */
interface Column {
  readonly name: string;
  /** The heading's classes. */
  readonly look: string;
}

/** One row of a grid: its label, and the path of its value for each column. */
interface Row {
  readonly label: string;
  path(column: string): string[];
}

const COLOUR_COLUMNS: readonly Column[] = COLOURS.map((colour) => ({
  name: colour,
  look: `tuning-colour ${colour}`,
}));
const ENEMY_COLUMNS: readonly Column[] = ENEMY_TYPES.map((type) => ({
  name: type,
  look: 'tuning-enemy',
}));

/**
 * The F2 tuning panel. Its Ink section holds the **Ink costs** switch and
 * the Game's Ink table: the prices and the Tank maximums. Its Wave section
 * holds the **Waves** switch and the Wave table: a count per Enemy type and
 * the gap between arrivals. Below them is every number of the material
 * table, and then of the enemy table. All are editable while the sandbox
 * runs, and "Copy as JSON" copies the four tables to paste back over their
 * defaults in the code. It lists whatever the tables hold, so values added later appear
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
  private readonly enemies: Tuned;
  private readonly wave: Tuned;
  private readonly inputs: { tuned: Tuned; path: string[]; input: HTMLInputElement }[] = [];
  /** Clicking the game gives the keys back to it. */
  private readonly giveKeysBack = (event: PointerEvent) => {
    if (!this.root.contains(event.target as Node)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  constructor(
    private readonly table: MaterialTable,
    private readonly enemyTable: EnemyTable,
    /** Where the Ink costs switch and the Ink table's edits go. */
    private readonly game: Pick<Game, 'inkCosts' | 'ink' | 'editInk' | 'defence'>,
  ) {
    this.materials = {
      table,
      defaults: DEFAULT_MATERIAL_TABLE,
      edit: (write) => editMaterials(table, write),
    };
    this.enemies = {
      table: enemyTable,
      defaults: DEFAULT_ENEMY_TABLE,
      edit: (write) => editEnemies(enemyTable, write),
    };
    // Through the Game, which empties a Tank down to a lowered maximum at once.
    this.ink = {
      table: game.ink,
      defaults: DEFAULT_INK_TABLE,
      edit: (write) => game.editInk(write),
    };
    this.wave = {
      table: game.defence.table,
      defaults: DEFAULT_WAVE_TABLE,
      edit: (write) => game.defence.edit(write),
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
      this.switch(
        'Ink costs (off: Ink is unlimited)',
        () => this.game.inkCosts,
        (on) => (this.game.inkCosts = on),
      ),
      this.grid(this.ink, COLOUR_COLUMNS, [
        { label: 'tank maximum (Line length)', path: (colour) => ['tanks', colour] },
      ]),
      this.sharedValues(this.ink, (path) => path[0] !== 'tanks'),
      element('div', 'tuning-section', 'Wave'),
      this.switch(
        'Waves (off: no Build Phase or Wave)',
        () => this.game.defence.waves,
        (on) => (this.game.defence.waves = on),
      ),
      this.grid(this.wave, ENEMY_COLUMNS, [{ label: 'count', path: (type) => ['counts', type] }]),
      this.sharedValues(this.wave, (path) => path[0] !== 'counts'),
      element('div', 'tuning-section', 'Material table'),
      this.grid(
        this.materials,
        COLOUR_COLUMNS,
        numberPaths(table.colours[COLOURS[0]]).map((row) => ({
          label: row.join(' '),
          path: (colour) => ['colours', colour, ...row],
        })),
      ),
      this.sharedValues(this.materials, (path) => path[0] !== 'colours'),
      element('div', 'tuning-section', 'Enemies'),
      this.grid(
        this.enemies,
        ENEMY_COLUMNS,
        numberPaths(enemyTable.types[ENEMY_TYPES[0]]).map((row) => ({
          label: row.join(' '),
          path: (type) => ['types', type, ...row],
        })),
      ),
      this.sharedValues(this.enemies, (path) => path[0] !== 'types'),
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
   * A switch of the Game's, off by default: Ink costs or Waves. Not a table
   * value: Defaults leaves it, and it is lost on reload.
   */
  private switch(label: string, read: () => boolean, write: (on: boolean) => void): HTMLElement {
    const row = element('label', 'tuning-ink');
    const box = element('input');
    box.type = 'checkbox';
    box.checked = read();
    box.addEventListener('change', () => write(box.checked));
    row.append(box, element('span', '', label));
    return row;
  }

  /** Shows every value as its table holds it now: a Level may have set its own Wave and Tanks. */
  refresh(): void {
    for (const { tuned, path, input } of this.inputs) {
      input.value = String(readPath(tuned.table, path));
      input.classList.remove('invalid');
      this.markModified(tuned, path, input);
    }
  }

  /** Per-Colour or per-type values as a grid: one row per value, one column per Colour or type. */
  private grid(tuned: Tuned, columns: readonly Column[], rows: readonly Row[]): HTMLElement {
    const grid = element('table', 'tuning-grid');
    const head = element('tr');
    head.append(element('th'));
    for (const { name, look } of columns) head.append(element('th', look, name));
    grid.append(head);
    for (const row of rows) {
      const tr = element('tr');
      tr.append(element('th', 'tuning-label', row.label));
      for (const { name } of columns) {
        const cell = element('td');
        cell.append(this.input(tuned, row.path(name)));
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
    for (const tuned of [this.materials, this.ink, this.wave, this.enemies]) {
      const paths = this.inputs.filter((entry) => entry.tuned === tuned).map(({ path }) => path);
      tuned.edit((table) => {
        for (const path of paths) writePath(table, path, readPath(tuned.defaults, path));
      });
    }
    this.refresh();
    this.say('Defaults restored');
  }

  private async copy(): Promise<void> {
    const json = tablesAsJson({
      materials: this.table,
      ink: this.game.ink,
      wave: this.game.defence.table,
      enemies: this.enemyTable,
    });
    try {
      await navigator.clipboard.writeText(json);
      this.say('Copied');
    } catch {
      // No clipboard access: show the JSON to copy by hand.
      window.prompt('Copy the material, Ink, Wave and enemy tables:', json);
    }
  }

  private say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 1500);
  }
}
