import { CandidateChange, ForensicsGroup, ForensicsReport, ForensicsSection, HistoricalRunoffBenchmark } from './forensics.models';

export function candidateFixture(id: string, votes1: number, votes2: number): CandidateChange {
  return { id, name: id === '4' ? 'Андрей Атанасов Гюров и Георги Димитров Кандев' : 'Илияна Малинова Йотова и Кирил Александров Вълчев',
    votes1, votes2, deltaVotes: votes2 - votes1, share1: null, share2: null, deltaSharePp: null,
    shareOfVoters1: null, shareOfVoters2: null, deltaShareOfVotersPp: null };
}

export function historicalFixture(overrides: Partial<HistoricalRunoffBenchmark> = {}): HistoricalRunoffBenchmark {
  const summary = { n: 10, registered1: 1000, registered2: 1000, added1: 5, added2: 7,
    voted1: 600, voted2: 550, deltaVoted: -50, turnout1: 60, turnout2: 55, deltaTurnoutPp: -5, meanDeltaPp: -4,
    finalists: [{ name: 'Първа историческа двойка', ballot1: '1', ballot2: '1', votes1: 200, votes2: 320, deltaVotes: 120, share1: 40, share2: 60 }] };
  return { ...summary, cycle: 2016, round1Date: '2016.11.06', round2Date: '2016.11.13', sections: 11, excludedN: 1,
    stableListSensitivity: { ...summary, n: 8 }, regions: [], quality: {},
    sources: [{ date: '2016.11.06', sourceUrl: 'https://results.cik.bg/pvrnr2016/tur1/export.zip', trustStatus: 'documented_official_archive_rebuild',
      freshArchiveVerification: false, sourceDocumentationUrl: '/data/2016.11.06/SOURCE.md' }],
    cohortDefinition: 'Съпоставими секции само в съответния изборен цикъл.', matchingConfidence: 'code_place_only_missing_addresses',
    limitations: ['Не се установява индивидуално прехвърляне на гласове.'],
    context: 'Първият тур съвпада с национален референдум.', contextSourceUrl: 'https://www.cik.bg/bg/decisions/example', ...overrides };
}

export function groupFixture(overrides: Partial<ForensicsGroup> = {}): ForensicsGroup {
  return { key: '5', name: 'Видин', n: 1, registered1: 250, registered2: 250, voted1: 90, voted2: 170,
    turnout1: 36, turnout2: 68, deltaTurnoutPp: 32, meanDeltaPp: 32, deltaVoted: 80,
    eligibleN: 1, flaggedN: 0, smallN: 1, ...overrides };
}

export function sectionFixture(overrides: Partial<ForensicsSection> = {}): ForensicsSection {
  return {
    sectionId: '050100001', regionId: '5', regionName: 'Видин', municipalityName: 'Белоградчик',
    municipalityCode: '0501', settlementName: 'Рабиша', settlementEkatte: '61097',
    elections: {}, comparableRoundPair: true, exclusionReasons: [],
    registered1: 250, registered2: 250, voted1: 90, voted2: 170,
    turnout1: 36, turnout2: 68, deltaTurnoutPp: 32, deltaTurnoutSensitivityPp: 32,
    deltaVoted: 80, sizeGroup: '<300', method1: 'paper', method2: 'paper', priority: true,
    small400: true, candidateChanges: [], history: {},
    signal: { peerN: 50, peerMedian: 2, peerMad: 3, robustZ: 4, empiricalUpperTail: .02,
      adjustedTail: .1, flags: [], alternativeExplanations: [], neighborCount: 0,
      neighborMean: null, spatialP: null, spatialQ: null },
    ...overrides,
  };
}

export function reportFixture(): ForensicsReport {
  const query = {
    id: 'query1', title: 'Тестова извадка', filter: {}, summary: {}, binSummary: [], methodSummary: [],
    findings: [], clusterIds: [], comparison: { targetN: 0, matchedN: 0, uniqueControlN: 0, meanDifferencePp: null,
      ci95: null, municipalities: 0, pairs: [], method: '', limitations: [] }, regions: [], municipalities: [], settlements: [], hypotheses: [],
    report: { facts: [], observations: [], hypotheses: [] },
  };
  return {
    metadata: { provisional: true }, definitions: {}, quality: {}, provenance: {},
    query1: { ...query }, query2: { ...query, id: 'query2' }, regions: [], municipalities: [],
    settlements: [], hypotheses: [], clusters: [], findings: [], methodology: {},
  };
}
