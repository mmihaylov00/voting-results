const BG_MONTHS = [
  'Януари',
  'Февруари',
  'Март',
  'Април',
  'Май',
  'Юни',
  'Юли',
  'Август',
  'Септември',
  'Октомври',
  'Ноември',
  'Декември',
] as const;

export function electionNameFromDate(date: string): string {
  const parts = String(date || '').split('.');
  if (parts.length !== 3) return date;
  const year = parts[0];
  const month = Number(parts[1]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return date;
  return `${BG_MONTHS[month - 1]} ${year}`;
}
