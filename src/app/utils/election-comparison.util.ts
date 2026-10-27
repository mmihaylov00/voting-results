import { Region, Section } from '../models/election.models';

export interface AnalysisSnapshot {
  electors: number;
  voted: number;
  votes: number | null;
  share: number | null;
  turnout: number | null;
  invalid: number | null;
  machine: number | null;
  margin: number | null;
  count: number;
}

export interface AnalysisRow {
  id: string;
  label: string;
  section?: Section;
  regionId?: string;
  current: AnalysisSnapshot;
  previous: AnalysisSnapshot | null;
  voteChange: number | null;
  shareChange: number | null;
  turnoutChange: number | null;
}

const PARTY_IDENTITIES = [
  ['ГЕРБ', 'ПП ГЕРБ', 'ГЕРБ-СДС', 'КОАЛИЦИЯ ГЕРБ-СДС'],
  ['ПРОДЪЛЖАВАМЕ ПРОМЯНАТА-ДЕМОКРАТИЧНА БЪЛГАРИЯ', 'КОАЛИЦИЯ ПРОДЪЛЖАВАМЕ ПРОМЯНАТА-ДЕМОКРАТИЧНА БЪЛГАРИЯ', 'ПП-ДБ'],
  ['ВЪЗРАЖДАНЕ', 'ПП ВЪЗРАЖДАНЕ'],
  ['ИМА ТАКЪВ НАРОД', 'ПП ИМА ТАКЪВ НАРОД', 'ИТН'],
  ['МЕЧ', 'ПП МЕЧ'],
  ['ВЕЛИЧИЕ', 'ПП ВЕЛИЧИЕ'],
  ['АТАКА', 'ПП АТАКА'],
  ['МИР', 'ПП МИР'],
  ['ПРАВОТО', 'ПП ПРАВОТО'],
  ['ОБЩЕСТВО ЗА НОВА БЪЛГАРИЯ', 'ПОЛИТИЧЕСКА ПАРТИЯ ОБЩЕСТВО ЗА НОВА БЪЛГАРИЯ', 'ПП ОБЩЕСТВО ЗА НОВА БЪЛГАРИЯ'],
  ['БЪЛГАРСКИ ВЪЗХОД', 'ПП БЪЛГАРСКИ ВЪЗХОД'],
  ['НАРОДНА ПАРТИЯ ИСТИНАТА И САМО ИСТИНАТА', 'ПП НАРОДНА ПАРТИЯ ИСТИНАТА И САМО ИСТИНАТА'],
] as const;

function normalizedName(name: string): string {
  return name.toLocaleUpperCase('bg').replace(/[„“"«»]/g, '').replace(/[\u2013\u2014]/g, '-')
    .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
}

export function partyIdentity(name: string): string {
  const normalized = normalizedName(name);
  return PARTY_IDENTITIES.find((aliases) => aliases.some((alias) => alias === normalized))?.[0] ?? normalized;
}

export function matchPartyId(name: string, parties: Record<string, string>): string | null {
  const identity = partyIdentity(name);
  const matches = Object.entries(parties).filter(([, partyName]) => partyIdentity(partyName) === identity);
  return matches.length === 1 ? matches[0][0] : null;
}

export function sectionIdentity(section: Section): string {
  return `${section.regionId.replace(/^0+(?=\d)/, '')}:${section.sectionId}`;
}

export function indexSections(sections: Section[]): Map<string, Section> {
  const indexed = new Map<string, Section>();
  const duplicates = new Set<string>();
  for (const section of sections) {
    const identity = sectionIdentity(section);
    if (indexed.has(identity)) duplicates.add(identity);
    indexed.set(identity, section);
  }
  for (const identity of duplicates) indexed.delete(identity);
  return indexed;
}

export function matchHistoricalSection(section: Section, historical: ReadonlyMap<string, Section>): Section | undefined {
  const previous = historical.get(sectionIdentity(section));
  if (!previous) return undefined;
  if (section.settlementEkatte && previous.settlementEkatte) {
    return section.settlementEkatte === previous.settlementEkatte ? previous : undefined;
  }
  return normalizedName(section.cityName) === normalizedName(previous.cityName) ? previous : undefined;
}

export function percent(value: number, total: number): number | null {
  return total > 0 ? value / total * 100 : null;
}

export function difference(current: number | null | undefined, previous: number | null | undefined): number | null {
  return current == null || previous == null ? null : current - previous;
}

type TotalsRow = { total: number; voted: number; discardedVotes?: number; totalPaper?: number; totalMachine?: number };

function summarize<T extends TotalsRow>(
  rows: T[],
  partiesForRow: (row: T) => Record<string, number>,
  partyId: string | null,
  electorsOverride?: number | null,
): AnalysisSnapshot {
  const totals = { electors: 0, voted: 0, invalid: 0, paper: 0, machine: 0 };
  const parties: Record<string, number> = {};
  for (const row of rows) {
    totals.electors += row.total;
    totals.voted += row.voted;
    totals.invalid += row.discardedVotes ?? 0;
    totals.paper += row.totalPaper ?? 0;
    totals.machine += row.totalMachine ?? 0;
    for (const [id, votes] of Object.entries(partiesForRow(row))) {
      parties[id] = (parties[id] ?? 0) + votes;
    }
  }
  const electors = electorsOverride ?? totals.electors;
  const ranked = Object.values(parties).sort((a, b) => b - a);
  const votes = partyId === null ? null : parties[partyId] ?? 0;
  return {
    electors,
    voted: totals.voted,
    votes,
    share: votes === null ? null : percent(votes, totals.voted),
    turnout: percent(totals.voted, electors),
    invalid: percent(totals.invalid, totals.voted),
    machine: percent(totals.machine, totals.paper + totals.machine),
    margin: ranked.length < 2 ? null : percent(ranked[0] - ranked[1], electors),
    count: rows.length,
  };
}

export function sectionSnapshot(sections: Section[], partyId: string | null, electorsOverride?: number | null): AnalysisSnapshot {
  return summarize(sections, (section) => Object.fromEntries(Object.entries(section.partyVotes).map(([id, votes]) => [id, votes.total])), partyId, electorsOverride);
}

export function regionSnapshot(regions: Region[], partyId: string | null, electorsOverride?: number | null): AnalysisSnapshot {
  return summarize(regions, (region) => region.partyVotes, partyId, electorsOverride);
}

export function comparisonRow(id: string, label: string, current: AnalysisSnapshot, previous: AnalysisSnapshot | null): AnalysisRow {
  return {
    id, label, current, previous,
    voteChange: difference(current.votes, previous?.votes),
    shareChange: difference(current.share, previous?.share),
    turnoutChange: difference(current.turnout, previous?.turnout),
  };
}

export function analysisCsv(rows: AnalysisRow[], currentDate: string, previousDate: string, partyName: string): string {
  const cells: (string | number | null)[][] = [
    ['Място', 'Код', 'Партия', 'Текущи избори', 'Сравнявани избори', 'Гласове сега', 'Гласове преди', 'Промяна гласове', 'Дял сега %', 'Дял преди %', 'Промяна дял п.п.', 'Активност сега %', 'Активност преди %', 'Промяна активност п.п.'],
    ...rows.map((row) => [row.label, row.id, partyName, currentDate, previousDate, row.current.votes, row.previous?.votes ?? null,
      row.voteChange, row.current.share, row.previous?.share ?? null, row.shareChange, row.current.turnout, row.previous?.turnout ?? null, row.turnoutChange]),
  ];
  return '\uFEFF' + cells.map((row) => row.map((cell) => {
    const value = cell === null ? '' : String(cell);
    const safe = typeof cell === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}
