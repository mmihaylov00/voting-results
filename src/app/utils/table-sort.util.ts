/**
 * Table sorting utility functions
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

/**
 * Generic sort function for arrays of objects
 * Supports string and number types with locale-aware comparison
 * @param array - Array to sort
 * @param column - Column/key to sort by
 * @param direction - Sort direction ('asc' or 'desc')
 * @param locale - Locale for string comparison (default: 'bg')
 * @param valueGetter - Optional function to extract/transform the value before sorting
 */
export function sortArray<T>(
  array: readonly T[],
  column: keyof T | string,
  direction: SortDirection = 'asc',
  locale: string = 'bg',
  valueGetter?: (item: T) => any
): T[] {
  const sorted = [...array];
  
  return sorted.sort((a, b) => {
    const valA: any = valueGetter ? valueGetter(a) : (a as any)[column];
    const valB: any = valueGetter ? valueGetter(b) : (b as any)[column];
    const missingA = valA == null || typeof valA === 'number' && !Number.isFinite(valA);
    const missingB = valB == null || typeof valB === 'number' && !Number.isFinite(valB);
    if (missingA || missingB) return Number(missingA) - Number(missingB);

    // Handle string comparison with locale
    if (typeof valA === 'string' && typeof valB === 'string') {
      const comparison = valA.localeCompare(valB, locale, { numeric: true });
      return direction === 'asc' ? comparison : -comparison;
    }

    // Handle number comparison
    if (typeof valA === 'number' && typeof valB === 'number') {
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    }

    // Fallback: convert to string and compare
    const strA = String(valA);
    const strB = String(valB);
    const comparison = strA.localeCompare(strB, locale, { numeric: true });
    return direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Toggle sort direction or set new column
 * Returns new sort state
 */
export function toggleSort(
  currentColumn: string,
  currentDirection: SortDirection,
  newColumn: string,
  defaultDirection: SortDirection = 'asc'
): SortState {
  if (currentColumn === newColumn) {
    return {
      column: newColumn,
      direction: currentDirection === 'asc' ? 'desc' : 'asc'
    };
  }
  return {
    column: newColumn,
    direction: defaultDirection
  };
}

/**
 * Get default sort direction for a column
 * Strings typically sort ascending first, numbers descending
 */
export function getDefaultSortDirection(column: string, isStringColumn: boolean = false): SortDirection {
  return isStringColumn ? 'asc' : 'desc';
}
