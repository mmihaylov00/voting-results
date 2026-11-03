import { ForensicsSection, SectionFilters } from './forensics.models';

const collator = new Intl.Collator('bg', { numeric: true, sensitivity: 'base' });

export function placeValue(row: ForensicsSection, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key] ?? row.geography?.[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
}

export function sectionLabel(row: ForensicsSection): string {
  return [placeValue(row, 'regionName', 'region'), placeValue(row, 'municipalityName', 'municipality'),
    placeValue(row, 'settlementName', 'settlement', 'cityName')].filter(Boolean).join(' / ');
}

export function filterSections(rows: ForensicsSection[], filters: SectionFilters): ForensicsSection[] {
  const search = filters.search.trim().toLocaleLowerCase('bg');
  const matches = rows.filter(row => {
    if (filters.focus && (!row.priority || !row.small400)) return false;
    if (!filters.focus && filters.scope === 'priority' && !row.priority) return false;
    if (filters.comparableOnly && (!row.comparableRoundPair || row['eligible'] === false)) return false;
    if (filters.flaggedOnly && !row.signal.flags.length) return false;
    if (filters.size && row.sizeGroup !== filters.size) return false;
    if (filters.method && row.method2 !== filters.method) return false;
    return !search || `${row.sectionId} ${sectionLabel(row)} ${placeValue(row, 'settlementEkatte', 'ekatte')} ${placeValue(row, 'address')}`
      .toLocaleLowerCase('bg').includes(search);
  });
  return matches.sort((left, right) => {
    const a = left[filters.sort];
    const b = right[filters.sort];
    // Missing measurements always follow measured values, in either direction.
    if (a === null || a === undefined) return b === null || b === undefined ? collator.compare(left.sectionId, right.sectionId) : 1;
    if (b === null || b === undefined) return -1;
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
    return (filters.descending ? -comparison : comparison) || collator.compare(left.sectionId, right.sectionId);
  });
}

export function safeSourceLinks(row: ForensicsSection): { date: string; url: string }[] {
  return Object.entries(row.elections ?? {}).flatMap(([date, election]) => Object.values(election?.sourceUrls ?? {})
    .filter((url): url is string => {
      if (!url) return false;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && (parsed.hostname === 'cik.bg' || parsed.hostname.endsWith('.cik.bg'));
      } catch { return false; }
    }).map(url => ({ date, url })));
}

export function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'няма данни';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('bg-BG', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

export function turnoutColor(value: number | null): string {
  if (value === null) return '#7b8792';
  if (value < -20) return '#174b78';
  if (value < -10) return '#3788b8';
  if (value < -3) return '#9ac6dc';
  if (value <= 3) return '#c0c3c6';
  if (value <= 10) return '#e8b562';
  if (value <= 20) return '#d97928';
  return '#a74016';
}
