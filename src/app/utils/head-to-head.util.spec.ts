import { describe, expect, it } from 'vitest';
import { Section } from '../models/election.models';
import { comparisonProfiles, comparisonStrongholds } from './head-to-head.util';

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010000001', regionId: '01', cityName: 'Град', settlementEkatte: '001', sectionName: '', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 1, noVotes: 4, activityBp: 8000, topParties: [],
    partyVotes: { '1': { total: 60, paper: 40, machine: 20 } },
    candidateVotes: {
      '1_101': { candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия', total: 20, paper: 10, machine: 10 },
      '1_102': { candidateId: '102', candidateName: 'Друг кандидат', partyId: '1', partyName: 'Партия', total: 10, paper: 5, machine: 5 },
    }, ...overrides,
  };
}

describe('head-to-head profiles', () => {
  it('keeps same-name and same-ballot candidates in different regions separate', () => {
    const profiles = comparisonProfiles([section(), section({ regionId: '02' })], { '1': 'Партия' }, 'candidates');
    const named = profiles.filter(profile => profile.name === 'Иван Иванов');
    expect(named).toHaveLength(2);
    expect(new Set(named.map(profile => profile.id)).size).toBe(2);
    expect(named.map(profile => profile.votes)).toEqual([20, 20]);
    expect(named[0].share).toBeCloseTo(100 / 3);
    expect(named[0].preferenceShare).toBeCloseTo(200 / 3);
  });

  it('keeps conflicting names under the same candidate number separate', () => {
    const changed = section();
    changed.candidateVotes!['1_101'] = { ...changed.candidateVotes!['1_101'], candidateName: 'Друг човек' };
    const profiles = comparisonProfiles([section(), changed], {}, 'candidates');
    expect(profiles.filter(profile => profile.candidateId === '101')).toHaveLength(2);
  });

  it('aggregates counts before rates and excludes no-support ballots', () => {
    const profiles = comparisonProfiles([section(), section({ voted: 120, partyVotes: { '1': { total: 60, paper: 40, machine: 20 }, '0': { total: 5, paper: 5, machine: 0 } } })], { '1': 'Партия' }, 'parties');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ votes: 120, paper: 80, machine: 40, share: 60, preferenceShare: 50 });
    expect(profiles[0].machineShare).toBeCloseTo(100 / 3);
  });

  it('keeps unavailable denominators null', () => {
    const profiles = comparisonProfiles([section({ voted: 0, partyVotes: { '1': { total: 0, paper: 0, machine: 0 } }, candidateVotes: {} })], { '1': 'Партия' }, 'parties');
    expect(profiles[0]).toMatchObject({ share: null, preferenceShare: null, machineShare: null });
    expect(comparisonProfiles([section({ candidateVotes: undefined })], {}, 'parties')[0].preferenceShare).toBeNull();
    expect(comparisonProfiles([], {}, 'candidates')).toEqual([]);
  });

  it('ranks strongest places by votes and never merges same-name settlements across regions', () => {
    const sections = [section(), section({ sectionId: '010000002' }), section({ regionId: '02', sectionId: '020000001' })];
    const profile = comparisonProfiles(sections, { '1': 'Партия' }, 'parties')[0];
    const places = comparisonStrongholds(sections, profile, 'settlement');
    expect(places).toHaveLength(2);
    expect(places.map(place => place.votes)).toEqual([120, 60]);
    expect(places[0].share).toBe(75);
    const candidate = comparisonProfiles(sections, {}, 'candidates').find(profile => profile.regionId === '02')!;
    expect(comparisonStrongholds(sections, candidate, 'section').map(place => place.sectionId)).toEqual(['020000001']);
  });
});
