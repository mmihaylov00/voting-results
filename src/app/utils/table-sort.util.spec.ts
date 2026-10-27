import { getDefaultSortDirection, sortArray, toggleSort } from './table-sort.util';

describe('shared table sorting', () => {
  it('sorts numbers numerically and keeps missing and non-finite values last in both directions without changing its input', () => {
    const rows = Object.freeze([{ value: 12 }, { value: null }, { value: 100 }, { value: undefined }, { value: 0 }, { value: NaN }]);
    expect(sortArray(rows, 'value', 'desc').map(row => row.value)).toEqual([100, 12, 0, null, undefined, NaN]);
    expect(sortArray(rows, 'value', 'asc').map(row => row.value)).toEqual([0, 12, 100, null, undefined, NaN]);
    expect(rows[0].value).toBe(12);
  });

  it('uses natural Bulgarian text and identifier ordering for both direct fields and column getters', () => {
    const rows = [{ name: 'София 10' }, { name: 'Варна' }, { name: 'София 2' }];
    expect(sortArray(rows, 'name').map(row => row.name)).toEqual(['Варна', 'София 2', 'София 10']);
    expect(sortArray(rows, 'label', 'desc', 'bg', row => row.name).map(row => row.name)).toEqual(['София 10', 'София 2', 'Варна']);
  });

  it('starts numeric columns descending, text ascending, then toggles the selected column', () => {
    expect(toggleSort('name', 'asc', 'votes', getDefaultSortDirection('votes'))).toEqual({ column: 'votes', direction: 'desc' });
    expect(toggleSort('votes', 'desc', 'votes', 'desc')).toEqual({ column: 'votes', direction: 'asc' });
    expect(toggleSort('votes', 'desc', 'name', getDefaultSortDirection('name', true))).toEqual({ column: 'name', direction: 'asc' });
  });
});
