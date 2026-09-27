import type { ReadonlyInkTable } from '../game/ink-table';
import type { MaterialTable } from '../materials/material-table';

/** The tables the F2 tuning panel edits. */
export interface TunedTables {
  /** Pasted over `DEFAULT_MATERIAL_TABLE` in src/materials/material-table.ts. */
  readonly materials: MaterialTable;
  /** Pasted over `DEFAULT_INK_TABLE` in src/game/ink-table.ts. */
  readonly ink: ReadonlyInkTable;
}

/**
 * What the panel's "Copy as JSON" copies: each table under its own key, in
 * the shape of its defaults in the code, to paste back over them.
 */
export function tablesAsJson(tables: TunedTables): string {
  const { materials, ink } = tables;
  return JSON.stringify({ materials, ink }, null, 2);
}
