export type ComparisonLeader = 'left' | 'right' | 'tie' | null;

const counts = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const rates = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isComparable(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function comparisonLeader(left: number | null | undefined, right: number | null | undefined): ComparisonLeader {
  if (!isComparable(left) || !isComparable(right)) return null;
  return left === right ? 'tie' : left > right ? 'left' : 'right';
}

export function formatComparisonValue(value: number | null | undefined, rate = false): string {
  if (!isComparable(value)) return '-';
  return rate ? rates.format(value) + '%' : counts.format(value);
}

export function comparisonDelta(left: number | null | undefined, right: number | null | undefined, rate: boolean): string {
  if (!isComparable(left) || !isComparable(right)) return '-';
  const value = left - right;
  if (rate && value !== 0 && Math.abs(value) < 0.005) return `${value > 0 ? '+' : '-'}<0,01 п.п.`;
  return `${value > 0 ? '+' : ''}${rate ? rates.format(value) : counts.format(value)}${rate ? ' п.п.' : ''}`;
}
