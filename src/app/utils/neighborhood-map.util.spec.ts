import { describe, expect, it } from 'vitest';
import { Section } from '../models/election.models';
import {
  NeighborhoodGeometryCollection,
  NeighborhoodGeometryFeature,
  aggregateSectionsByNeighborhood,
  resolveNeighborhoodForLocation,
} from './neighborhood-map.util';

function square(code: string, west: number, south: number, size: number): NeighborhoodGeometryFeature {
  return {
    type: 'Feature', properties: { code, name: code },
    geometry: { type: 'Polygon', coordinates: [[
      [west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south],
    ]] },
  };
}

function collection(...features: NeighborhoodGeometryFeature[]): NeighborhoodGeometryCollection {
  return { type: 'FeatureCollection', features };
}

describe('neighborhood map', () => {
  it('chooses the smallest containing polygon, independent of input order', () => {
    const large = square('large', 23, 42, 0.1);
    const small = square('small', 23.02, 42.02, 0.02);
    expect(resolveNeighborhoodForLocation(collection(large, small), 23.03, 42.03)?.properties.code).toBe('small');
    expect(resolveNeighborhoodForLocation(collection(small, large), 23.08, 42.08)?.properties.code).toBe('large');
  });

  it('excludes polygon holes and their boundaries while including the outer boundary', () => {
    const feature = square('with-hole', 23, 42, 0.1);
    if (feature.geometry.type !== 'Polygon') throw new Error('Expected Polygon');
    feature.geometry.coordinates.push([
      [23.02, 42.02], [23.04, 42.02], [23.04, 42.04], [23.02, 42.04], [23.02, 42.02],
    ]);
    const geometry = collection(feature);
    expect(resolveNeighborhoodForLocation(geometry, 23.03, 42.03)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, 23.02, 42.03)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, 23, 42.05)?.properties.code).toBe('with-hole');
    expect(resolveNeighborhoodForLocation(geometry, 23.08, 42.08)?.properties.code).toBe('with-hole');
  });

  it('supports disjoint multipolygons and skips points outside their polygons', () => {
    const first = square('a', 23, 42, 0.02);
    const second = square('b', 23.06, 42.06, 0.02);
    if (first.geometry.type !== 'Polygon' || second.geometry.type !== 'Polygon') throw new Error('Expected Polygon');
    const geometry = collection({
      type: 'Feature', properties: { code: 'multi', name: 'Multi' },
      geometry: { type: 'MultiPolygon', coordinates: [first.geometry.coordinates, second.geometry.coordinates] },
    });
    expect(resolveNeighborhoodForLocation(geometry, 23.01, 42.01)?.properties.code).toBe('multi');
    expect(resolveNeighborhoodForLocation(geometry, 23.07, 42.07)?.properties.code).toBe('multi');
    expect(resolveNeighborhoodForLocation(geometry, 23.04, 42.04)).toBeNull();
  });

  it('ignores absent, non-finite and invalid coordinates', () => {
    const geometry = collection(square('a', 23, 42, 0.02));
    expect(resolveNeighborhoodForLocation(geometry, null, 42.01)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, 23.01, undefined)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, NaN, 42.01)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, 23.01, 91)).toBeNull();
    expect(resolveNeighborhoodForLocation(geometry, 0, 0)).toBeNull();
  });

  it('reuses settlement metric aggregation while retaining original sections and coverage gaps', () => {
    const section: Section = {
      sectionId: '010100001', regionId: '1', regionName: 'Благоевград', cityName: 'Град', sectionName: 'Секция', sectionType: 'City',
      longitude: 23.01, latitude: 42.01, total: 100, voted: 70, discardedVotes: 2, noVotes: 1, totalPaper: 40, totalMachine: 30,
      partyVotes: { a: { total: 40, paper: 20, machine: 20 }, b: { total: 27, paper: 18, machine: 9 } },
      topParties: [], activityBp: 7000,
    };
    const geometry = collection(square('area', 23, 42, 0.02));
    const [aggregate] = aggregateSectionsByNeighborhood([
      section, { ...section, sectionId: 'other', longitude: 24 }, { ...section, sectionId: 'abroad', regionId: '32' },
    ], { a: 'А', b: 'Б' }, geometry);
    expect(aggregate.neighborhoodCode).toBe('area');
    expect(aggregate.geometryKey).toBe('area');
    expect(aggregate.voted).toBe(70);
    expect(aggregate.totalElectors).toBe(100);
    expect(aggregate.partyTotals).toEqual({ a: 40, b: 27 });
    expect(aggregate.leadingParty?.partyId).toBe('a');
    expect(aggregate.sections).toEqual([section]);
    expect(aggregate.sections[0]).toBe(section);
    expect(section.settlementEkatte).toBeUndefined();
  });

  it('normalizes reversed domestic coordinates and combines different Sofia sections in one neighborhood', () => {
    const first: Section = {
      sectionId: '234601001', regionId: '23', regionName: 'София 23', cityName: 'София', sectionName: 'Секция', sectionType: 'City',
      settlementEkatte: '68134', longitude: 42.01, latitude: 23.01, total: 100, voted: 70, discardedVotes: 2, noVotes: 1,
      partyVotes: { a: { total: 40, paper: 20, machine: 20 } }, topParties: [], activityBp: 7000,
    };
    const second = { ...first, sectionId: '244622014', regionId: '24', settlementEkatte: '98114', longitude: 23.01, latitude: 42.01 };
    const aggregates = aggregateSectionsByNeighborhood([first, second], { a: 'А' }, collection(square('OSM:AREA:1', 23, 42, 0.02)));
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].voted).toBe(140);
    expect(aggregates[0].partyTotals['a']).toBe(80);
    expect(aggregates[0].sections).toEqual([first, second]);
    expect(first.longitude).toBe(42.01);
  });
});
