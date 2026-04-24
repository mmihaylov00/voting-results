import { describe, expect, it } from 'vitest';
import { normalizeAbroadSection, splitAbroadLocation } from './abroad-section.util';
import { Section } from '../models/election.models';

describe('abroad section util', () => {
  it('splits abroad locations into country and locality', () => {
    expect(splitAbroadLocation('Австралия, Канбера')).toEqual({
      countryName: 'Австралия',
      localityName: 'Канбера',
    });
    expect(splitAbroadLocation('САЩ, Илинойс, Чикаго')).toEqual({
      countryName: 'САЩ',
      localityName: 'Илинойс, Чикаго',
    });
  });

  it('normalizes abroad sections without touching domestic ones', () => {
    const abroadSection: Section = {
      sectionId: '320010001',
      regionId: '32',
      regionName: '32. Извън страната',
      cityName: 'Австрия, Виена',
      sectionName: 'Посолство',
      sectionType: 'Other',
      total: 100,
      voted: 80,
      discardedVotes: 0,
      noVotes: 0,
      partyVotes: {},
      topParties: [],
      activityBp: 8000,
    };

    expect(normalizeAbroadSection(abroadSection)).toMatchObject({
      municipalityName: 'Австрия',
      cityName: 'Виена',
    });

    const domesticSection: Section = {
      ...abroadSection,
      regionId: '23',
      regionName: '23. СОФИЯ',
      cityName: 'гр.София',
    };

    expect(normalizeAbroadSection(domesticSection)).toEqual(domesticSection);
  });
});
