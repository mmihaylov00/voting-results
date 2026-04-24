import { describe, expect, it } from 'vitest';
import { aggregateAbroadSectionsByContinent, getAbroadContinentId } from './abroad-map.util';
import { Section } from '../models/election.models';

describe('abroad map util', () => {
  it('maps country names to continents', () => {
    expect(getAbroadContinentId('Германия, Берлин')).toBe('europe');
    expect(getAbroadContinentId('САЩ, Илинойс, Чикаго')).toBe('north-america');
    expect(getAbroadContinentId('Австралия, Сидни')).toBe('oceania');
  });

  it('aggregates abroad sections by continent and party leader', () => {
    const sections: Section[] = [
      {
        sectionId: '320010001',
        regionId: '32',
        regionName: '32. Извън страната',
        cityName: 'Германия, Берлин',
        sectionName: 'A',
        sectionType: 'Other',
        total: 100,
        voted: 80,
        discardedVotes: 1,
        noVotes: 2,
        partyVotes: {
          '1': { total: 30, paper: 10, machine: 20 },
          '2': { total: 40, paper: 20, machine: 20 },
        },
        topParties: [],
        activityBp: 8000,
      },
      {
        sectionId: '320020001',
        regionId: '32',
        regionName: '32. Извън страната',
        cityName: 'Франция, Париж',
        sectionName: 'B',
        sectionType: 'Other',
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
        cityName: 'САЩ, Чикаго',
        sectionName: 'C',
        sectionType: 'Other',
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

    const aggregates = aggregateAbroadSectionsByContinent(sections, {
      '1': 'Партия А',
      '2': 'Партия Б',
      '3': 'Партия В',
    });

    const europe = aggregates.find((aggregate) => aggregate.id === 'europe');
    const northAmerica = aggregates.find((aggregate) => aggregate.id === 'north-america');

    expect(europe?.voted).toBe(115);
    expect(europe?.countries).toEqual(['Германия', 'Франция']);
    expect(europe?.leadingParty?.partyId).toBe('1');
    expect(northAmerica?.leadingParty?.partyId).toBe('3');
  });
});
