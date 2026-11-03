import { describe, expect, it } from 'vitest';
import { hydrateSectionRecord } from './forensics-record.util';
import { sectionFixture } from './forensics.fixtures';

describe('lazy section record registration hydration', () => {
  it('restores sparse ballots with exact election and regional registrations', () => {
    const row = sectionFixture({ regionId: '21', elections: { '2026.04.19': {
      registered: 250, voted: 100, turnout: 40, sourceUrls: {}, noSupport: 20, totalCandidateVotes: 80,
      votesByParty: { '1': { total: 60, paper: 40, machine: 20 }, '25': { total: 20, paper: 20, machine: 0 } },
    } } });
    const hydrated = hydrateSectionRecord(row, { '2026.04.19': {
      parties: { '1': 'Точна коалиция', '2': 'Друга регистрация' },
      regionalParties: { '21:25': 'ИК Тодор Тодоров Батков', '5:26': 'Друг местен кандидат' },
    } });
    const history = hydrated.history['2026.04.19'].parties;
    expect(history.map(party => party.id)).toEqual(['1', '2', '25']);
    expect(history.find(party => party.id === '25')?.name).toBe('ИК Тодор Тодоров Батков');
    expect(history.find(party => party.id === '2')?.votes).toBe(0);
    expect(history[0].share).toBe(75);
    expect(history[0].shareOfVoters).toBe(60);
    expect(row.elections['2026.04.19']?.votesByParty['2']).toBeUndefined();
  });

  it('keeps zero denominators and missing historical elections explicitly unavailable', () => {
    const row = sectionFixture({ history: { '2024.10.27': { matched: false, verified: false, eligibleForModel: false,
      parties: [], gerbShare: null, dpsShare: null } }, elections: { '2026.04.19': {
      registered: 0, voted: 0, turnout: null, sourceUrls: {}, totalCandidateVotes: 0,
      votesByParty: { '1': { name: 'Регистрация', total: 0, paper: 0, machine: 0 } },
    } } });
    const hydrated = hydrateSectionRecord(row, undefined);
    expect(hydrated.history['2026.04.19'].parties[0].share).toBeNull();
    expect(hydrated.history['2026.04.19'].parties[0].shareOfVoters).toBeNull();
    expect(hydrated.history['2024.10.27'].matched).toBe(false);
    expect(hydrated.history['2024.10.27'].parties).toEqual([]);
    expect(hydrated.history['2024.10.27'].verified).toBe(false);
    expect(hydrated.history['2024.10.27'].eligibleForModel).toBe(false);
  });
});
