import { describe, expect, it } from 'vitest';
import { createMaterialTable } from './material-table';
import { numberPaths, readPath, writePath } from './table-paths';

describe('Material table paths', () => {
  it('lists every number in a nested table, in order, by its path', () => {
    const table = { a: 1, b: { c: 2, d: { e: 3 } }, f: 'not a number' };

    expect(numberPaths(table)).toEqual([['a'], ['b', 'c'], ['b', 'd', 'e']]);
  });

  it('finds every value of the material table, so a panel can list whatever it holds', () => {
    const table = createMaterialTable();
    const paths = numberPaths(table).map((path) => path.join('.'));

    expect(paths).toContain('colours.blue.line.restitution');
    expect(paths).toContain('colours.black.fill.density');
    expect(paths).toContain('wakeSpeed');
    expect(paths.every((path) => typeof readPath(table, path.split('.')) === 'number')).toBe(true);
  });

  it('writes a value in place, where the table is read from', () => {
    const table = createMaterialTable();

    writePath(table, ['colours', 'blue', 'line', 'restitution'], 0.5);

    expect(table.colours.blue.line.restitution).toBe(0.5);
    expect(readPath(table, ['colours', 'blue', 'line', 'restitution'])).toBe(0.5);
  });
});
