import { ForensicsGroup, ForensicsReport, ForensicsSection } from './forensics.models';

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
