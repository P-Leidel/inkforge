import { COLOURS } from '../materials/colour';
import { DEFAULT_MATERIAL_TABLE, type MaterialTable } from '../materials/material-table';
import { numberPaths, readPath, writePath } from '../materials/table-paths';

/**
 * The F2 tuning panel: every number of the material table, editable while
 * the sandbox runs, and "Copy as JSON" to paste the table back into
 * src/materials/material-table.ts. It lists whatever the table holds, so
 * values added later appear without changes here. Edits go straight into the
 * table the Sandbox world reads, so they survive R and Clear.
 *
 * A plain HTML overlay (styles in index.html). Keys typed into it don't reach
 * the game; clicking the game gives the keys back.
 */
export class TuningPanel {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly inputs: { path: string[]; input: HTMLInputElement }[] = [];
  /** Clicking the game gives the keys back to it. */
  private readonly giveKeysBack = (event: PointerEvent) => {
    if (!this.root.contains(event.target as Node)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  constructor(private readonly table: MaterialTable) {
    this.root = element('div', 'tuning-panel');
    this.root.hidden = true;

    const header = element('div', 'tuning-header');
    header.append(element('span', 'tuning-title', 'Material table (F2)'));
    const copy = element('button', '', 'Copy as JSON');
    copy.addEventListener('click', () => void this.copy());
    const defaults = element('button', '', 'Defaults');
    defaults.addEventListener('click', () => this.restoreDefaults());
    this.status = element('span', 'tuning-status');
    header.append(copy, defaults, this.status);
    this.root.append(header, this.colourGrid(), this.sharedValues());

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

  /** The per-Colour values as a grid: one row per value, one column per Colour. */
  private colourGrid(): HTMLElement {
    const grid = element('table', 'tuning-grid');
    const head = element('tr');
    head.append(element('th'));
    for (const colour of COLOURS) head.append(element('th', `tuning-colour ${colour}`, colour));
    grid.append(head);
    for (const row of numberPaths(this.table.colours[COLOURS[0]])) {
      const tr = element('tr');
      tr.append(element('th', 'tuning-label', row.join(' ')));
      for (const colour of COLOURS) {
        const cell = element('td');
        cell.append(this.input(['colours', colour, ...row]));
        tr.append(cell);
      }
      grid.append(tr);
    }
    return grid;
  }

  /** The values shared by all Colours. */
  private sharedValues(): HTMLElement {
    const list = element('table', 'tuning-grid');
    for (const path of numberPaths(this.table)) {
      if (path[0] === 'colours') continue;
      const tr = element('tr');
      tr.append(element('th', 'tuning-label', path.join(' ')));
      const cell = element('td');
      cell.append(this.input(path));
      tr.append(cell);
      list.append(tr);
    }
    return list;
  }

  private input(path: string[]): HTMLInputElement {
    const input = element('input');
    input.type = 'number';
    input.step = 'any';
    input.value = String(readPath(this.table, path));
    input.title = path.join('.');
    input.addEventListener('input', () => {
      const value = Number(input.value);
      const valid = input.value.trim() !== '' && Number.isFinite(value);
      input.classList.toggle('invalid', !valid);
      if (valid) writePath(this.table, path, value);
      this.markModified(path, input);
    });
    this.inputs.push({ path, input });
    this.markModified(path, input);
    return input;
  }

  /** Highlights a value that differs from the code's default. */
  private markModified(path: string[], input: HTMLInputElement): void {
    const changed = readPath(this.table, path) !== readPath(DEFAULT_MATERIAL_TABLE, path);
    input.classList.toggle('modified', changed);
  }

  private restoreDefaults(): void {
    for (const { path, input } of this.inputs) {
      const value = readPath(DEFAULT_MATERIAL_TABLE, path);
      writePath(this.table, path, value);
      input.value = String(value);
      input.classList.remove('invalid');
      this.markModified(path, input);
    }
    this.say('Defaults restored');
  }

  private async copy(): Promise<void> {
    const json = JSON.stringify(this.table, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.say('Copied');
    } catch {
      // No clipboard access: show the JSON to copy by hand.
      window.prompt('Copy the material table:', json);
    }
  }

  private say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 1500);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
