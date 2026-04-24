import { describe, expect, it } from 'vitest';
import {
  aggregateAbroadSectionsByCity,
  buildAbroadCountryCodeMap,
  getAbroadCityName,
  getAbroadCountryName,
  getAbroadNameParts,
} from './abroad-map.util';
import { Section } from '../models/election.models';

describe('abroad map util', () => {
  it('parses country and city names from abroad section labels', () => {
    expect(getAbroadCountryName('Германия, Берлин')).toBe('Германия');
    expect(getAbroadCityName('САЩ, Илинойс, Чикаго')).toBe('Чикаго');
    expect(getAbroadNameParts('Франция, Париж').displayName).toBe('Франция, Париж');
  });

  it('builds a country lookup map with aliases', () => {
    const map = buildAbroadCountryCodeMap([
      { name: 'Германия', code: 'DE', capitalLocation: '13.4,52.5' },
      { name: 'Южна Африка', code: 'ZA', capitalLocation: null },
    ]);

    expect(map.get('германия фр')?.code).toBe('DE');
    expect(map.get('република южна африка')?.code).toBe('ZA');
  });

  it('aggregates abroad sections by city and country', () => {
    const sections: Section[] = [
      {
        sectionId: '320010001',
        regionId: '32',
        regionName: '32. Извън страната',
        cityName: 'Германия, Берлин',
        sectionName: 'A',
        sectionType: 'Other',
        longitude: 13.4,
        latitude: 52.5,
        total: 100,
        voted: 80,
        discardedVotes: 1,
        noVotes: 2,
        partyVotes: {
          '1': { total: 30, paper: 10, machine: 20 },
          '2': { total: 40, paper: 20, machine: 20 },
        },
        candidateVotes: {
          c1: {
            candidateId: 'c1',
            candidateName: 'Кандидат 1',
            partyId: '2',
            partyName: 'Партия Б',
            total: 10,
            paper: 4,
            machine: 6,
          },
        },
        topParties: [],
        activityBp: 8000,
      },
      {
        sectionId: '320010002',
        regionId: '32',
        regionName: '32. Извън страната',
        cityName: 'Германия, Берлин',
        sectionName: 'B',
        sectionType: 'Other',
        longitude: 13.5,
        latitude: 52.6,
        total: 50,
        voted: 35,
        discardedVotes: 0,
        noVotes: 1,
        partyVotes: {
          '1': { total: 25, paper: 10, machine: 15 },
          '2': { total: 5, paper: 3, machine: 2 },
        },
        topParties: [],
        activityBp: 7000,
      },
      {
        sectionId: '320030001',
        regionId: '32',
        regionName: '32. Извън страната',
        cityName: 'САЩ, Илинойс, Чикаго',
        sectionName: 'C',
        sectionType: 'Other',
        longitude: -87.6298,
        latitude: 41.8781,
        total: 80,
        voted: 50,
        discardedVotes: 0,
        noVotes: 0,
        partyVotes: {
          '3': { total: 20, paper: 10, machine: 10 },
        },
        topParties: [],
        activityBp: 6250,
      },
    ];

    const aggregates = aggregateAbroadSectionsByCity(
      sections,
      {
        '1': 'Партия А',
        '2': 'Партия Б',
        '3': 'Партия В',
      },
      [
        { name: 'Германия', code: 'DE', capitalLocation: '13.4,52.5' },
        { name: 'САЩ', code: 'US', capitalLocation: '-77.0,38.9' },
      ]
    );

    expect(aggregates).toHaveLength(2);

    const berlin = aggregates.find((aggregate) => aggregate.countryCode === 'DE');
    const chicago = aggregates.find((aggregate) => aggregate.countryCode === 'US');

    expect(berlin?.cityName).toBe('Берлин');
    expect(berlin?.voted).toBe(115);
    expect(berlin?.leadingParty?.partyId).toBe('1');
    expect(berlin?.longitude).toBeCloseTo(13.45, 3);
    expect(berlin?.latitude).toBeCloseTo(52.55, 3);
    expect(chicago?.cityName).toBe('Чикаго');
    expect(chicago?.leadingParty?.partyId).toBe('3');
  });
});
