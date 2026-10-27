import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandidateVotes, RegionCandidate, Section } from '../models/election.models';
import { ContestantElection, ContestantRisk, contestantSectionRows } from './contestant-profile.util';
import { preferenceProfileElection } from './preference-profile.util';

const election: ContestantElection = { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' };
const candidate: RegionCandidate = {
  candidateId: '101', candidateName: 'Иван Петров Иванов', partyId: '1', partyName: 'ГЕРБ-СДС',
  total: 10, paper: 6, machine: 4, totalInRegion: 10, partyPercentInRegion: 40, preferencePercentOfPartyVotes: 25,
};

function votes(overrides: Partial<CandidateVotes> = {}): CandidateVotes {
  return { candidateId: '109', candidateName: candidate.candidateName, partyId: '7', partyName: 'ПП ГЕРБ',
    total: 10, paper: 6, machine: 4, ...overrides };
}

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010000001', regionId: '01', regionName: 'Първи район', municipalityName: 'Община',
    settlementEkatte: '10000', longitude: 23, latitude: 42, cityName: 'Град', sectionName: 'Училище',
    sectionType: 'City', total: 100, voted: 80, discardedVotes: 3, noVotes: 2,
    topParties: [], activityBp: 8000, partyVotes: { '7': { total: 40, paper: 30, machine: 10 } },
    candidateVotes: { '7_109': votes() }, ...overrides,
  };
}

describe('preference profile election projection', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('matches names and curated party families instead of reused party and candidate numbers', async () => {
    const raw = section({ candidateVotes: {
      '1_101': votes({ partyId: '1', partyName: 'БСП', candidateId: '101', total: 900 }),
      '7_101': votes({ candidateId: '101', candidateName: 'Друг Кандидат', total: 30 }),
      '7_109': votes({ candidateName: ' ИВАН  ПЕТРОВ ИВАНОВ ' }),
    } });
    const result = await preferenceProfileElection(candidate, election, [raw], { '1': 'БСП', '7': 'ГЕРБ-СДС' });
    expect(result?.participation).toMatchObject({ partyId: 'preference', fullName: candidate.candidateName,
      votes: 10, voted: 40, share: 25, rank: 2, gapToLeader: 20 });
    expect(result?.lists[0]).toMatchObject({ regionId: '01', partyId: '7', candidateId: '109', votes: 10,
      paper: 6, machine: 4, partyVotes: 40, share: 25, rank: 2, gapToLeader: 20 });
    expect(result?.sections[0].partyVotes).toEqual({ preference: { total: 10, paper: 6, machine: 4 } });
    const fallback = await preferenceProfileElection(candidate, election, [section({ candidateVotes: {
      first: votes(), duplicate: votes({ partyName: 'ГЕРБ', candidateName: ' ИВАН ПЕТРОВ ИВАНОВ ', total: 999 }),
    } }), section({ sectionId: '010000002', candidateVotes: {
      otherParty: votes({ partyName: 'БСП', total: 999 }),
    } })], {});
    expect(fallback?.participation.votes).toBe(10);
  });

  it('aggregates two unambiguous district lists and includes their zero-preference sections', async () => {
    const source = [
      section({ candidateVotes: { target: votes(), other: votes({ candidateId: '101', candidateName: 'Друг Кандидат', total: 30 }) } }),
      section({ sectionId: '010000002', candidateVotes: undefined, partyVotes: { '7': { total: 60, paper: 40, machine: 20 } } }),
      section({ sectionId: '020000001', regionId: '02', regionName: 'Втори район',
        partyVotes: { '7': { total: 50, paper: 35, machine: 15 } },
        candidateVotes: { target: votes({ candidateId: '102', total: 20, paper: 15, machine: 5 }) } }),
      section({ sectionId: '030000001', regionId: '03', candidateVotes: { other: votes({ candidateName: 'Друг Кандидат' }) } }),
    ];
    const result = await preferenceProfileElection(candidate, election, source, { '7': 'ПП ГЕРБ' });
    expect(result?.participation).toMatchObject({ votes: 30, voted: 150, share: 20, rank: null, gapToLeader: null });
    expect(result?.lists.map(list => [list.regionId, list.candidateId, list.partyVotes, list.share, list.rank]))
      .toEqual([['01', '109', 100, 10, 2], ['02', '102', 50, 40, 1]]);
    expect(result?.sections).toHaveLength(3);
    expect(result?.sections[1]).toMatchObject({ voted: 60, partyVotes: { preference: { total: 0, paper: 0, machine: 0 } } });
    expect(result?.sourceSections).toHaveLength(4);
  });

  it('omits ambiguous homonymous lists without merging their votes into accepted districts', async () => {
    const ambiguous = section({ candidateVotes: {
      first: votes({ candidateId: '101', total: 10 }), second: votes({ candidateId: '102', total: 20 }),
    } });
    const accepted = section({ sectionId: '020000001', regionId: '02', candidateVotes: { target: votes({ candidateId: '103', total: 5 }) } });
    const result = await preferenceProfileElection(candidate, election, [ambiguous, accepted], { '7': 'ГЕРБ' });
    expect(result?.lists.map(list => [list.regionId, list.votes])).toEqual([['02', 5]]);
    expect(result?.sections.map(row => row.regionId)).toEqual(['02']);
    expect(await preferenceProfileElection(candidate, election, [ambiguous], { '7': 'ГЕРБ' })).toBeNull();
    expect(await preferenceProfileElection({ ...candidate, partyName: 'ДПС' }, election,
      [section({ candidateVotes: { target: votes({ partyName: 'ДПС - Ново начало' }) } })], { '7': 'ДПС - Ново начало' })).toBeNull();
  });

  it('distinguishes explicit zero preferences from a missing person and unavailable denominators', async () => {
    const zero = section({ candidateVotes: { target: votes({ total: 0, paper: 0, machine: 0 }) } });
    expect((await preferenceProfileElection(candidate, election, [zero], { '7': 'ГЕРБ' }))?.participation)
      .toMatchObject({ votes: 0, share: 0, rank: 1 });
    expect(await preferenceProfileElection(candidate, election, [section({ candidateVotes: undefined })], { '7': 'ГЕРБ' })).toBeNull();
    expect((await preferenceProfileElection(candidate, election, [{ ...zero, partyVotes: {} }], { '7': 'ГЕРБ' }))?.participation.share).toBeNull();
    expect(await preferenceProfileElection(candidate, { ...election, type: 'presidential' }, [zero], { '7': 'ГЕРБ' })).toBeNull();
  });

  it('isolates and deduplicates common and candidate-specific risks without mutating source evidence', async () => {
    const common: ContestantRisk = { code: 'R1.1', category: 'R1', severity: 'medium' };
    const own: ContestantRisk = { code: 'R5.1', category: 'R5', severity: 'high',
      details: { partyId: '7', candidateId: '109', sectionId: '010000001', value: 42 } };
    const raw: Section & { candidateRiskIndicators: ContestantRisk[] } = {
      ...section(), riskIndicators: [common, own,
        { ...own, code: 'other-person', details: { partyId: '7', candidateId: '110' } },
        { ...own, code: 'other-party', details: { partyId: '8', candidateId: '109' } },
        { ...own, code: 'other-section', details: { partyId: '7', candidateId: '109', sectionId: '999' } },
        { ...own, code: 'unknown-party', details: { candidateId: '109' } },
        { ...own, code: 'party-only', details: { partyId: '7' } },
        { ...own, code: 'R6.2', details: { partyId: '7', candidateId: '110' } },
        { ...own, code: 'R2.4', details: { partyId: '7' } },
        { ...own, code: 'R6.2' }, { ...own, code: 'R2.4' },
      ], candidateRiskIndicators: [own, common, { ...own, code: 'R6.2' }],
    };
    const before = structuredClone(raw);
    const result = await preferenceProfileElection(candidate, election, [raw], { '7': 'ГЕРБ' });
    expect(result?.sections[0].riskIndicators?.map(risk => risk.code)).toEqual(['R1.1', 'R5.1']);
    expect(result?.sections[0].riskIndicators?.[1].details).toEqual({ partyId: 'preference', sectionId: '010000001', value: 42 });
    expect(result?.lists[0].risks.map(risk => risk.code)).toEqual(['R6.2', 'R2.4']);
    expect(result?.lists[0].risks.every(risk => risk.details.partyId === '7' && risk.details.candidateId === '109')).toBe(true);
    expect(contestantSectionRows(result!.sections, 'preference')[0].risks).toHaveLength(2);
    expect(raw).toEqual(before);
    expect(own.details.candidateId).toBe('109');
  });

  it('retains source references and geography, without retaining candidate maps on projections', async () => {
    const raw = section();
    const before = structuredClone(raw);
    const result = await preferenceProfileElection(candidate, election, [raw], { '7': 'ГЕРБ' });
    expect(result?.sourceSections[0]).toBe(raw);
    expect(result?.sections[0]).not.toBe(raw);
    expect(result?.sections[0]).toMatchObject({ sectionId: raw.sectionId, regionId: raw.regionId,
      regionName: raw.regionName, cityName: raw.cityName, municipalityName: raw.municipalityName,
      settlementEkatte: raw.settlementEkatte, longitude: raw.longitude, latitude: raw.latitude });
    expect(result?.sections[0].candidateVotes).toBeUndefined();
    expect(raw).toEqual(before);
  });

  it('preserves missing assessments separately from assessed zero', async () => {
    const result = await preferenceProfileElection(candidate, election, [section(),
      section({ sectionId: '010000002', candidateVotes: undefined, riskScore: 0 }),
      section({ sectionId: '010000003', candidateVotes: undefined, riskIndicators: [] }),
    ], { '7': 'ГЕРБ' });
    expect(contestantSectionRows(result!.sections, 'preference').map(row => row.risks)).toEqual([null, [], []]);
  });

  it('reads each candidate map once and yields while scanning large archives', async () => {
    vi.useFakeTimers();
    const normalize = vi.spyOn(String.prototype, 'normalize');
    const raw = section();
    const readVotes = vi.fn(() => ({ target: votes() }));
    Object.defineProperty(raw, 'candidateVotes', { get: readVotes });
    const pending = preferenceProfileElection(candidate, election, Array.from({ length: 201 }, () => raw), { '7': 'ГЕРБ' });
    let complete = false;
    void pending.then(() => { complete = true; });
    expect(readVotes).toHaveBeenCalledTimes(200);
    expect(complete).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    expect((await pending)?.participation.votes).toBe(2010);
    expect(readVotes).toHaveBeenCalledTimes(201);
    expect(normalize).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at the next batch boundary when aborted and never scans an already aborted request', async () => {
    vi.useFakeTimers();
    const raw = section();
    const readVotes = vi.fn(() => ({ target: votes() }));
    Object.defineProperty(raw, 'candidateVotes', { get: readVotes });
    const controller = new AbortController();
    const pending = preferenceProfileElection(candidate, election, Array.from({ length: 201 }, () => raw), { '7': 'ГЕРБ' }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await vi.runAllTimersAsync();
    await rejected;
    expect(readVotes).toHaveBeenCalledTimes(200);
    readVotes.mockClear();
    await expect(preferenceProfileElection(candidate, election, [raw], { '7': 'ГЕРБ' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(readVotes).not.toHaveBeenCalled();
  });
});
