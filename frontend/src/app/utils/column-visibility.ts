export function loadVisibleColumns(
  storageKey: string,
  validIds: string[],
  logLabel: string = 'columns'
): Set<string> | null {
  const savedColumns = localStorage.getItem(storageKey);
  if (!savedColumns) return null;
  try {
    const columnsArray = JSON.parse(savedColumns);
    if (Array.isArray(columnsArray)) {
      const validColumns = columnsArray.filter(id => validIds.includes(id));
      if (validColumns.length > 0) {
        return new Set(validColumns);
      }
    }
  } catch (error) {
    console.error(`Error parsing saved ${logLabel}`, error);
  }
  return null;
}

export function saveVisibleColumns(storageKey: string, selectedIds: Set<string>): void {
  localStorage.setItem(storageKey, JSON.stringify(Array.from(selectedIds)));
}
