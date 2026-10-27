import { Section } from '../models/election.models';
import { SettlementAggregate, aggregateSectionsBySettlement } from './settlement-map.util';

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];
type Bounds = [number, number, number, number];

export interface NeighborhoodGeometryFeature {
  type: 'Feature';
  bbox?: Bounds;
  properties: { code: string; name: string; area?: number };
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };
}

export interface NeighborhoodGeometryCollection {
  type: 'FeatureCollection';
  features: NeighborhoodGeometryFeature[];
}

export interface NeighborhoodAggregate extends SettlementAggregate {
  neighborhoodCode: string;
  neighborhoodName: string;
}

type IndexedFeature = { feature: NeighborhoodGeometryFeature; bounds: Bounds; area: number };
type NeighborhoodIndex = {
  cells: Map<string, IndexedFeature[]>;
  locations: Map<string, NeighborhoodGeometryFeature | null>;
};

const CELL_SIZE = 0.1;
const indexes = new WeakMap<NeighborhoodGeometryCollection, NeighborhoodIndex>();

function polygons(feature: NeighborhoodGeometryFeature): Polygon[] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

function geometryBounds(feature: NeighborhoodGeometryFeature): Bounds {
  if (feature.bbox) return feature.bbox;
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons(feature)) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        bounds[0] = Math.min(bounds[0], longitude);
        bounds[1] = Math.min(bounds[1], latitude);
        bounds[2] = Math.max(bounds[2], longitude);
        bounds[3] = Math.max(bounds[3], latitude);
      }
    }
  }
  return bounds;
}

function ringArea(ring: Ring): number {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    area += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return Math.abs(area / 2);
}

function geometryArea(feature: NeighborhoodGeometryFeature): number {
  return polygons(feature).reduce((sum, polygon) => sum + (polygon[0] ? ringArea(polygon[0]) : 0)
    - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0);
}

function indexFor(data: NeighborhoodGeometryCollection): NeighborhoodIndex {
  const cached = indexes.get(data);
  if (cached) return cached;
  const index: NeighborhoodIndex = { cells: new Map(), locations: new Map() };
  const features = data.features.map(feature => ({
    feature, bounds: geometryBounds(feature), area: feature.properties.area ?? geometryArea(feature),
  })).sort((a, b) => a.area - b.area || a.feature.properties.code.localeCompare(b.feature.properties.code));
  for (const item of features) {
    if (!item.bounds.every(Number.isFinite)) continue;
    const [west, south, east, north] = item.bounds.map(value => Math.floor(value / CELL_SIZE));
    for (let x = west; x <= east; x++) {
      for (let y = south; y <= north; y++) {
        const key = `${x}:${y}`;
        const cell = index.cells.get(key);
        if (cell) cell.push(item);
        else index.cells.set(key, [item]);
      }
    }
  }
  indexes.set(data, index);
  return index;
}

function ringContains(ring: Ring, longitude: number, latitude: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crossProduct = (longitude - x) * (previousY - y) - (latitude - y) * (previousX - x);
    if (Math.abs(crossProduct) < 1e-10 && longitude >= Math.min(x, previousX) && longitude <= Math.max(x, previousX)
      && latitude >= Math.min(y, previousY) && latitude <= Math.max(y, previousY)) return true;
    if ((y > latitude) !== (previousY > latitude)
      && longitude < (previousX - x) * (latitude - y) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

export function resolveNeighborhoodForLocation(
  data: NeighborhoodGeometryCollection,
  longitude: number | null | undefined,
  latitude: number | null | undefined
): NeighborhoodGeometryFeature | null {
  if (typeof longitude !== 'number' || typeof latitude !== 'number' || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || (longitude === 0 && latitude === 0)) return null;
  const index = indexFor(data);
  const locationKey = `${longitude}:${latitude}`;
  if (index.locations.has(locationKey)) return index.locations.get(locationKey) ?? null;
  const candidates = index.cells.get(`${Math.floor(longitude / CELL_SIZE)}:${Math.floor(latitude / CELL_SIZE)}`) ?? [];
  const match = candidates.find(({ feature, bounds }) => longitude >= bounds[0] && longitude <= bounds[2]
    && latitude >= bounds[1] && latitude <= bounds[3]
    && polygons(feature).some(polygon => polygon[0] && ringContains(polygon[0], longitude, latitude)
      && !polygon.slice(1).some(hole => ringContains(hole, longitude, latitude))))?.feature ?? null;
  index.locations.set(locationKey, match);
  return match;
}

export function aggregateSectionsByNeighborhood(
  sections: Section[],
  partiesById: Record<string, string>,
  geometry: NeighborhoodGeometryCollection
): NeighborhoodAggregate[] {
  const groups = new Map<string, { feature: NeighborhoodGeometryFeature; sections: Section[] }>();
  for (const section of sections) {
    if (section.regionId === '32') continue;
    let longitude = section.longitude;
    let latitude = section.latitude;
    // Older domestic files store Bulgaria's latitude in the longitude field.
    if (longitude !== undefined && latitude !== undefined && longitude >= 41 && longitude <= 45 && latitude >= 22 && latitude <= 29) {
      [longitude, latitude] = [latitude, longitude];
    }
    const feature = resolveNeighborhoodForLocation(geometry, longitude, latitude);
    if (!feature) continue;
    const group = groups.get(feature.properties.code);
    if (group) group.sections.push(section);
    else groups.set(feature.properties.code, { feature, sections: [section] });
  }
  return Array.from(groups.values()).flatMap(({ feature, sections: groupedSections }) => {
    const [aggregate] = aggregateSectionsBySettlement(groupedSections.map(section => ({
      ...section, settlementEkatte: feature.properties.code,
    })), partiesById);
    if (!aggregate) return [];
    return [{
      ...aggregate,
      neighborhoodCode: feature.properties.code,
      neighborhoodName: feature.properties.name,
      displayName: feature.properties.name,
      sections: groupedSections,
    }];
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'bg'));
}
