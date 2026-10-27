import { Section } from '../models/election.models';
import { indexSections, matchHistoricalSection } from './election-comparison.util';

export interface MapSelection {
  sectionIds: string[];
  label: string;
  kind: 'region' | 'municipality' | 'settlement' | 'neighborhood' | 'section' | 'country' | 'city';
}

export function restoreMapSelection(selection: MapSelection | null, source: Section[], target: Section[]): MapSelection | null {
  if (!selection) return null;
  const ids = new Set(selection.sectionIds);
  const index = indexSections(target);
  const sectionIds = source.filter(section => ids.has(section.sectionId))
    .map(section => matchHistoricalSection(section, index)?.sectionId)
    .filter((id): id is string => id !== undefined);
  return { ...selection, sectionIds };
}

export interface MapSearchItem extends MapSelection {
  id: string;
}

export interface MapExportContext {
  election: string;
  metricLabel?: string;
  place?: string;
}

export function searchMapItems(items: MapSearchItem[], query: string): MapSearchItem[] {
  const words = query.trim().toLocaleLowerCase('bg').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter(item => {
    const label = item.label.toLocaleLowerCase('bg');
    return words.every(word => label.includes(word));
  }).sort((first, second) => Number(first.kind === 'section') - Number(second.kind === 'section')).slice(0, 12);
}

export interface MarkerLocation {
  id: string;
  latitude: number;
  longitude: number;
}

/** Display offsets only; source coordinates remain unchanged. */
export function buildMarkerOffsets(locations: MarkerLocation[]): Map<string, { x: number; y: number }> {
  const groups = new Map<string, string[]>();
  for (const location of locations) {
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
    const key = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
    const group = groups.get(key) || [];
    group.push(location.id);
    groups.set(key, group);
  }
  const offsets = new Map<string, { x: number; y: number }>();
  for (const ids of groups.values()) {
    ids.sort();
    ids.forEach((id, index) => {
      if (ids.length === 1) {
        offsets.set(id, { x: 0, y: 0 });
        return;
      }
      const ring = Math.floor(index / 8) + 1;
      const count = Math.min(8, ids.length - (ring - 1) * 8);
      const angle = (index % 8) * 2 * Math.PI / count - Math.PI / 2;
      offsets.set(id, { x: Math.cos(angle) * ring * 13, y: Math.sin(angle) * ring * 13 });
    });
  }
  return offsets;
}
