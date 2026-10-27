import { describe, expect, it } from 'vitest';
import { comparisonDelta, comparisonLeader, formatComparisonValue } from './comparison-display.util';

describe('comparison display', () => {
  it('keeps small nonzero percentage differences distinct from a tie', () => {
    expect(comparisonDelta(1.001, 1, true)).toBe('+<0,01 п.п.');
    expect(comparisonDelta(1, 1.001, true)).toBe('-<0,01 п.п.');
    expect(comparisonDelta(1.006, 1, true)).toBe('+0,01 п.п.');
    expect(comparisonDelta(0, 0, true)).toBe('0,00 п.п.');
    expect(comparisonLeader(1.001, 1)).toBe('left');
  });

  it('keeps zero values and rejects missing or non-finite values', () => {
    expect(formatComparisonValue(0)).toBe('0');
    expect(formatComparisonValue(0, true)).toBe('0,00%');
    expect(comparisonLeader(0, 0)).toBe('tie');
    expect(comparisonDelta(0, 1, false)).toBe('-1');
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(formatComparisonValue(value)).toBe('-');
      expect(comparisonLeader(value, 0)).toBeNull();
      expect(comparisonDelta(value, 0, true)).toBe('-');
    }
  });
});
