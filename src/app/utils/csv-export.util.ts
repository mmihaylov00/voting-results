type CsvCell = string | number | null | undefined;

export interface CsvExportData {
  filename: string;
  headers: readonly string[];
  rows: readonly (readonly CsvCell[])[];
}

export function createCsv(rows: readonly (readonly CsvCell[])[]): string {
  return '\uFEFF' + rows.map(row => row.map(cell => {
    const value = cell == null || typeof cell === 'number' && !Number.isFinite(cell) ? '' : String(cell);
    const safe = typeof cell === 'string' && (/^[\t\r\n]/.test(value) || /^\s*[=+@-]/.test(value)) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

export function downloadCsvFile(contents: string, filename: string): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8;' }));
  try {
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
