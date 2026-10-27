import { Section } from '../models/election.models';
import { indexSections, matchHistoricalSection, percent } from './election-comparison.util';
import { filterSectionLevelRisks, UNIQUE_RISK_CODES } from './risk-utils';

export interface RiskHistoryElection {
  date: string;
  name: string;
  type: string;
  round?: number;
}

export interface RiskHistoryDataset {
  sections: Section[];
  parties: Record<string, string>;
}

export interface SectionRiskHistoryRow {
  date: string;
  name: string;
  status: 'assessed' | 'unavailable' | 'unmatched' | 'missing';
  score: number | null;
  codes: string[];
  flagged: boolean;
  turnout: number | null;
  winnerName: string | null;
  winnerShare: number | null;
  tied: boolean;
}

export interface SectionRiskHistory {
  rows: SectionRiskHistoryRow[];
  assessed: number;
  flagged: number;
  unmatched: number;
  unavailable: number;
}

export interface RecurringSectionRisk {
  section: Section;
  assessed: number;
  flagged: number;
  unavailable: number;
  currentAssessed: boolean;
  currentFlagged: boolean;
  codes: string[];
}

function comparableElections(date: string, elections: readonly RiskHistoryElection[]): RiskHistoryElection[] {
  const current = elections.find((election) => election.date === date);
  return current ? elections
    .filter((election) => election.type === current.type && election.round === current.round && election.date <= date)
    .sort((left, right) => left.date.localeCompare(right.date)) : [];
}

function assessment(section: Section | undefined): { score: number | null; codes: string[]; flagged: boolean } {
  const hasIndicators = Array.isArray(section?.riskIndicators);
  const indicators = filterSectionLevelRisks(section?.riskIndicators ?? [], UNIQUE_RISK_CODES);
  const rawScore = section?.riskScore;
  const score = hasIndicators ? indicators.length
    : typeof rawScore === 'number' && Number.isFinite(rawScore) && rawScore >= 0 ? rawScore : null;
  const codes = [...new Set<string>(indicators.map((indicator) => indicator.code))].sort();
  return { score, codes, flagged: score !== null && (score > 0 || codes.length > 0) };
}

export function buildSectionRiskHistory(
  section: Section | null,
  date: string,
  elections: readonly RiskHistoryElection[],
  history: Readonly<Record<string, RiskHistoryDataset>>,
): SectionRiskHistory {
  if (!section) return { rows: [], assessed: 0, flagged: 0, unmatched: 0, unavailable: 0 };

  const rows = comparableElections(date, elections)
    .map((election): SectionRiskHistoryRow => {
      const dataset = history[election.date];
      const matched = election.date === date
        ? section
        : dataset && matchHistoricalSection(section, indexSections(dataset.sections));
      const risk = assessment(matched);
      const status = !matched ? dataset ? 'unmatched' : 'missing' : risk.score !== null ? 'assessed' : 'unavailable';
      const ranked = Object.entries(matched?.partyVotes ?? {}).filter(([id]) => id !== '0')
        .sort((left, right) => right[1].total - left[1].total);
      const topVotes = ranked[0]?.[1].total ?? 0;
      const winners = topVotes > 0 ? ranked.filter(([, votes]) => votes.total === topVotes) : [];
      return {
        date: election.date,
        name: election.name,
        status,
        ...risk,
        turnout: matched ? percent(matched.voted, matched.total) : null,
        winnerName: winners.length ? winners.map(([id]) => dataset?.parties[id] ?? matched?.topParties.find((party) => party.partyId === id)?.name ?? `№ ${id}`).join(' / ') : null,
        winnerShare: matched && winners.length ? percent(topVotes, matched.voted) : null,
        tied: winners.length > 1,
      };
    });

  return {
    rows,
    assessed: rows.filter((row) => row.status === 'assessed').length,
    flagged: rows.filter((row) => row.flagged).length,
    unmatched: rows.filter((row) => row.status === 'unmatched').length,
    unavailable: rows.filter((row) => row.status === 'missing' || row.status === 'unavailable').length,
  };
}

export function buildRecurringSectionRisks(
  date: string,
  elections: readonly RiskHistoryElection[],
  history: Readonly<Record<string, RiskHistoryDataset>>,
): RecurringSectionRisk[] {
  const dates = comparableElections(date, elections);
  const indexes = new Map(dates.map((election) => [election.date, indexSections(history[election.date]?.sections ?? [])]));
  const rows: RecurringSectionRisk[] = [];
  for (const section of indexes.get(date)?.values() ?? []) {
    let assessed = 0;
    let flagged = 0;
    const codes = new Set<string>();
    for (const election of dates) {
      const matched = election.date === date ? section : matchHistoricalSection(section, indexes.get(election.date)!);
      const risk = assessment(matched);
      if (risk.score !== null) assessed++;
      if (risk.flagged) {
        flagged++;
        risk.codes.forEach((code) => codes.add(code));
      }
    }
    const currentRisk = assessment(section);
    if (flagged >= 2) rows.push({ section, assessed, flagged, unavailable: dates.length - assessed,
      currentAssessed: currentRisk.score !== null, currentFlagged: currentRisk.flagged,
      codes: [...codes].sort() });
  }
  return rows.sort((left, right) => right.flagged - left.flagged
    || right.flagged / right.assessed - left.flagged / left.assessed
    || left.section.sectionId.localeCompare(right.section.sectionId));
}
