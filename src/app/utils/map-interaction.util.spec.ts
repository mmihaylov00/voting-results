import { describe, expect, it } from 'vitest';
import { buildMarkerOffsets, restoreMapSelection, searchMapItems } from './map-interaction.util';
import { Section } from '../models/election.models';

describe('map interaction', () => {
  it('searches all words without case sensitivity and ignores empty searches', () => {
    const items = [
      { id: 'a', label: 'Секция 123 - София', sectionIds: ['123'], kind: 'section' as const },
      { id: 'b', label: 'Секция 124 - Пловдив', sectionIds: ['124'], kind: 'section' as const },
    ];
    expect(searchMapItems(items, 'СОФИЯ 123')).toEqual([items[0]]);
    expect(searchMapItems(items, ' ')).toEqual([]);
    expect(searchMapItems(items, 'София 124')).toEqual([]);
  });

  it('separates co-located markers deterministically without modifying coordinates', () => {
    const locations = Array.from({ length: 19 }, (_, index) => ({
      id: String(index), latitude: 42.7, longitude: 23.3,
    }));
    const before = structuredClone(locations);
    const offsets = buildMarkerOffsets(locations);
    expect(buildMarkerOffsets([...locations].reverse())).toEqual(offsets);
    expect(new Set([...offsets.values()].map(point => `${point.x},${point.y}`)).size).toBe(19);
    expect(locations).toEqual(before);
    expect(buildMarkerOffsets([{ id: 'single', latitude: 43, longitude: 25 }]).get('single'))
      .toEqual({ x: 0, y: 0 });
  });

  it('ignores unavailable marker coordinates', () => {
    expect(buildMarkerOffsets([{ id: 'bad', latitude: NaN, longitude: 23 }]).size).toBe(0);
  });

  it('restores the same geographic selection across elections and retains an empty selection when unavailable', () => {
    const section = (cityName: string): Section => ({
      sectionId: '230000001', regionId: '23', cityName, sectionName: '', sectionType: 'normal',
      total: 100, voted: 50, discardedVotes: 0, noVotes: 0, activityBp: 5000, partyVotes: {}, topParties: [],
    });
    const selection = { sectionIds: ['230000001'], label: 'София', kind: 'settlement' as const };
    expect(restoreMapSelection(selection, [section('София')], [section('София')])).toEqual(selection);
    expect(restoreMapSelection(selection, [section('София')], [section('Варна')])).toEqual({ ...selection, sectionIds: [] });
    expect(restoreMapSelection(null, [], [])).toBeNull();
  });
});
