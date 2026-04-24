import { describe, expect, it } from 'vitest';
import {
  aggregateSectionsBySettlement,
  getGeometryRegionCode,
} from './settlement-map.util';
import { Section } from '../models/election.models';

describe('settlement-map util', () => {
  it('maps Sofia split regions to geometry codes', () => {
    expect(getGeometryRegionCode('23')).toBe('S23');
    expect(getGeometryRegionCode('24')).toBe('S24');
    expect(getGeometryRegionCode('25')).toBe('S25');
  });

  it('aggregates sections by settlement and picks deterministic leaders', () => {
    const sections: Section[] = [
      {
        sectionId: '010100001',
        regionId: '1',
        regionName: '01. БЛАГОЕВГРАД',
        settlementEkatte: '02676',
        cityName: 'гр.Банско',
        sectionName: 'A',
        sectionType: 'City',
        total: 100,
        voted: 80,
        discardedVotes: 2,
        noVotes: 1,
        noVotesPaper: 1,
        noVotesMachine: 0,
        partyVotes: {
          '1': { total: 40, paper: 20, machine: 20 },
          '2': { total: 30, paper: 15, machine: 15 },
        },
        candidateVotes: {
          '1_101': {
            candidateId: '101',
            candidateName: 'А',
            partyId: '1',
            partyName: 'Партия А',
            total: 12,
            paper: 6,
            machine: 6,
          },
        },
        topParties: [],
        activityBp: 8000,
      },
      {
        sectionId: '010100002',
        regionId: '1',
        regionName: '01. БЛАГОЕВГРАД',
        settlementEkatte: '02676',
        cityName: 'гр.Банско',
        sectionName: 'B',
        sectionType: 'City',
        total: 120,
        voted: 90,
        discardedVotes: 3,
        noVotes: 0,
        noVotesPaper: 0,
        noVotesMachine: 0,
        partyVotes: {
          '1': { total: 10, paper: 5, machine: 5 },
          '2': { total: 45, paper: 25, machine: 20 },
        },
        candidateVotes: {
          '2_102': {
            candidateId: '102',
            candidateName: 'Б',
            partyId: '2',
            partyName: 'Партия Б',
            total: 20,
            paper: 12,
            machine: 8,
          },
        },
        topParties: [],
        activityBp: 7500,
      },
    ];

    const aggregates = aggregateSectionsBySettlement(sections, {
      '1': 'Партия А',
      '2': 'Партия Б',
    });

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].displayName).toBe('Банско');
    expect(aggregates[0].geometryKey).toBe('02676');
    expect(aggregates[0].leadingParty?.partyId).toBe('2');
    expect(aggregates[0].leadingParty?.total).toBe(75);
    expect(aggregates[0].leadingPreference?.candidateId).toBe('102');
  });

  it('uses Sofia district geometry keys for Sofia city sections', () => {
    const sections: Section[] = [
      {
        sectionId: '244601001',
        regionId: '24',
        regionName: '24. СОФИЯ 24 МИР',
        settlementEkatte: '68134',
        cityName: 'гр.София',
        sectionName: 'A',
        sectionType: 'City',
        total: 100,
        voted: 80,
        discardedVotes: 1,
        noVotes: 0,
        partyVotes: {
          '1': { total: 40, paper: 20, machine: 20 },
        },
        topParties: [],
        activityBp: 8000,
      },
    ];

    const aggregates = aggregateSectionsBySettlement(sections, { '1': 'Партия А' });

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].geometryKey).toBe('68134-2401');
    expect(aggregates[0].displayName).toBe('Средец');
    expect(aggregates[0].geometryMunicipalityCode).toBe('S2401');
  });

  it('skips abroad and sections without settlement geometry keys', () => {
    const sections: Section[] = [
      {
        sectionId: '320100001',
        regionId: '32',
        regionName: '32. Извън страната',
        settlementEkatte: 'EU',
        cityName: 'Европа',
        sectionName: 'A',
        sectionType: 'Other',
        total: 10,
        voted: 10,
        discardedVotes: 0,
        noVotes: 0,
        partyVotes: {},
        topParties: [],
        activityBp: 10000,
      },
      {
        sectionId: '010100001',
        regionId: '1',
        regionName: '01. БЛАГОЕВГРАД',
        cityName: 'гр.Банско',
        sectionName: 'A',
        sectionType: 'City',
        total: 10,
        voted: 10,
        discardedVotes: 0,
        noVotes: 0,
        partyVotes: {},
        topParties: [],
        activityBp: 10000,
      },
    ];

    expect(aggregateSectionsBySettlement(sections, {})).toEqual([]);
  });
});
