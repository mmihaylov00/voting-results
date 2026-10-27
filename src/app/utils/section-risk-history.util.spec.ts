import { describe, expect, it } from 'vitest';
import { Section } from '../models/election.models';
import { buildRecurringSectionRisks, buildSectionRiskHistory, RiskHistoryElection } from './section-risk-history.util';

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010100001', regionId: '01', cityName: 'Банско', settlementEkatte: '02676',
    sectionName: 'Училище', sectionType: 'City', total: 100, voted: 80,
    discardedVotes: 2, noVotes: 3, activityBp: 8000,
    partyVotes: { '1': { total: 45, paper: 25, machine: 20 }, '2': { total: 30, paper: 15, machine: 15 } },
    topParties: [], ...overrides,
  };
}

const elections: RiskHistoryElection[] = [
  { date: '2026.04.19', name: '2026', type: 'governmental' },
  { date: '2024.10.27', name: '2024', type: 'governmental' },
  { date: '2023.04.02', name: '2023', type: 'governmental' },
];

describe('section risk history', () => {
  it('counts assessed zeros separately from unavailable evaluations and excludes future elections', () => {
    const result = buildSectionRiskHistory(section({ riskIndicators: [] }), '2024.10.27', elections, {
      '2026.04.19': { sections: [section({ riskScore: 3 })], parties: { '1': 'Партия 2026' } },
      '2023.04.02': { sections: [section()], parties: { '1': 'Партия 2023' } },
    });
    expect(result.rows.map((row) => row.date)).toEqual(['2023.04.02', '2024.10.27']);
    expect(result.rows[0].status).toBe('unavailable');
    expect(result.rows[0].score).toBeNull();
    expect(result.rows[1].score).toBe(0);
    expect(result.assessed).toBe(1);
    expect(result.flagged).toBe(0);
    expect(result.unavailable).toBe(1);
  });

  it('uses conservative section matching and omits ambiguous or moved historical sections', () => {
    const result = buildSectionRiskHistory(section({ riskScore: 1 }), '2026.04.19', elections, {
      '2024.10.27': { sections: [section({ settlementEkatte: '99999', riskScore: 3 })], parties: {} },
      '2023.04.02': { sections: [section({ riskScore: 1 }), section({ riskScore: 2 })], parties: {} },
    });
    expect(result.assessed).toBe(1);
    expect(result.flagged).toBe(1);
    expect(result.unmatched).toBe(2);
    expect(result.rows[0].turnout).toBeNull();
  });

  it('keeps election types and presidential rounds separate', () => {
    const catalog: RiskHistoryElection[] = [
      { date: '2021.11.21', name: '2021 round 2', type: 'presidential', round: 2 },
      { date: '2021.11.14', name: '2021 round 1', type: 'presidential', round: 1 },
      { date: '2021.07.11', name: 'Parliament', type: 'governmental' },
      { date: '2016.11.13', name: '2016 round 2', type: 'presidential', round: 2 },
    ];
    const result = buildSectionRiskHistory(section({ riskScore: 0 }), '2021.11.21', catalog, {});
    expect(result.rows.map((row) => row.date)).toEqual(['2016.11.13', '2021.11.21']);
    expect(result.rows[0].status).toBe('missing');
  });

  it('shows the historical party label and computes turnout and winner share from counts', () => {
    const result = buildSectionRiskHistory(section({ riskScore: 0 }), '2026.04.19', elections, {
      '2024.10.27': {
        sections: [section({ regionId: '1', riskIndicators: [{ code: 'R1.1', category: 'R1', severity: 'high' }] })],
        parties: { '1': 'Историческо име' },
      },
    });
    const row = result.rows[1];
    expect(row.flagged).toBe(true);
    expect(row.codes).toEqual(['R1.1']);
    expect(row.score).toBe(1);
    expect(row.turnout).toBe(80);
    expect(row.winnerShare).toBe(56.25);
    expect(row.winnerName).toBe('Историческо име');
    expect(result.flagged).toBe(1);
    expect(result.assessed).toBe(2);
  });

  it('does not pick an arbitrary winner in a tie or invent a rate for zero voters', () => {
    const result = buildSectionRiskHistory(section({
      voted: 0, total: 0, riskScore: 0,
      partyVotes: { '1': { total: 10, paper: 10, machine: 0 }, '2': { total: 10, paper: 10, machine: 0 } },
    }), '2026.04.19', elections, {
      '2026.04.19': { sections: [], parties: { '1': 'А', '2': 'Б' } },
    });
    expect(result.rows[2].winnerName).toBe('А / Б');
    expect(result.rows[2].tied).toBe(true);
    expect(result.rows[2].turnout).toBeNull();
    expect(result.rows[2].winnerShare).toBeNull();
  });

  it('does not treat non-finite or negative scores as completed assessments', () => {
    const result = buildSectionRiskHistory(section({ riskScore: Number.NaN }), '2026.04.19', elections, {
      '2024.10.27': { sections: [section({ riskScore: -1 })], parties: {} },
      '2023.04.02': { sections: [section({ riskScore: Infinity })], parties: {} },
    });
    expect(result.assessed).toBe(0);
    expect(result.unavailable).toBe(3);
  });

  it('ranks recurring sections while excluding single flags, ambiguous identities and unavailable scores', () => {
    const recurring = section({ riskScore: 1 });
    const quiet = section({ sectionId: '010100002', riskScore: 0 });
    const currentUnavailable = section({ sectionId: '010100003' });
    const history = {
      '2026.04.19': { sections: [recurring, quiet, currentUnavailable], parties: {} },
      '2024.10.27': { sections: [recurring, quiet, { ...currentUnavailable, riskScore: 1 }], parties: {} },
      '2023.04.02': { sections: [recurring, { ...quiet, riskScore: 1 }, { ...currentUnavailable, riskScore: 1 }], parties: {} },
    };
    const rows = buildRecurringSectionRisks('2026.04.19', elections, history);
    expect(rows.map((row) => row.section.sectionId)).toEqual(['010100001', '010100003']);
    expect(rows[0]).toMatchObject({ flagged: 3, assessed: 3, unavailable: 0, currentAssessed: true, currentFlagged: true });
    expect(rows[1]).toMatchObject({ flagged: 2, assessed: 2, unavailable: 1, currentAssessed: false, currentFlagged: false });
    const duplicateHistory = { ...history, '2026.04.19': { sections: [recurring, recurring], parties: {} } };
    expect(buildRecurringSectionRisks('2026.04.19', elections, duplicateHistory)).toEqual([]);
  });

  it('does not include later risk flags or a different presidential round in recurrence', () => {
    const recurring = section({ riskScore: 1 });
    const history = Object.fromEntries(elections.map((election) => [election.date, { sections: [recurring], parties: {} }]));
    expect(buildRecurringSectionRisks('2023.04.02', elections, history)).toEqual([]);
    const presidential = elections.map((election, index) => ({ ...election, type: 'presidential', round: index === 0 ? 2 : 1 }));
    expect(buildRecurringSectionRisks('2026.04.19', presidential, history)).toEqual([]);
  });

  it('excludes candidate-only risks present in the compiled section array and raw score', () => {
    const candidateRisk = { code: 'R2.5', category: 'R2', severity: 'medium', details: { candidateId: '101', partyId: '1' } };
    const candidateOnly = section({ riskScore: 1, riskIndicators: [candidateRisk] });
    const history = Object.fromEntries(elections.map((election) => [election.date, { sections: [candidateOnly], parties: {} }]));
    expect(buildRecurringSectionRisks('2026.04.19', elections, history)).toEqual([]);
    const row = buildSectionRiskHistory(candidateOnly, '2026.04.19', elections, history).rows[2];
    expect(row).toMatchObject({ status: 'assessed', score: 0, codes: [], flagged: false });
    const mixed = section({ riskScore: 2, riskIndicators: [candidateRisk, { code: 'R1.1', category: 'R1', severity: 'high' }] });
    expect(buildSectionRiskHistory(mixed, '2026.04.19', elections, {}).rows[2]).toMatchObject({ score: 1, codes: ['R1.1'], flagged: true });
  });
});
