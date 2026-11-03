export interface ForensicsElection {
  registered: number | null;
  voted: number | null;
  turnout: number | null;
  sourceUrls: Record<string, string | null>;
  votesByParty: Record<string, { name?: string; total: number; paper: number; machine: number; share?: number | null; [key: string]: unknown }>;
  sourceDiscrepancies?: unknown[];
  special?: boolean;
  specialReasons?: string[];
  institutionReviewFlag?: boolean;
  [key: string]: unknown;
}

export interface CandidateChange {
  id: string;
  name: string;
  votes1: number;
  votes2: number;
  deltaVotes: number;
  share1: number | null;
  share2: number | null;
  deltaSharePp: number | null;
  shareOfVoters1: number | null;
  shareOfVoters2: number | null;
  deltaShareOfVotersPp: number | null;
  finalistShare1?: number | null;
  finalistShare2?: number | null;
  deltaFinalistSharePp?: number | null;
  gainPer100Registered?: number | null;
}

export interface CandidateVoteTotals {
  id: string;
  name: string;
  votes1: number;
  votes2: number;
  deltaVotes: number;
}

export interface CandidateAnalysisSummary {
  eligibleSections: number;
  usableSections: number;
  excludedZeroFinalistSections: number;
  stableListSections: number;
  candidates: (CandidateVoteTotals & { finalistShare1: number | null; finalistShare2: number | null; deltaFinalistSharePp: number | null })[];
  deltaVoted: number | null;
  screen: { definition: string; sections: number; yotovaGain: number; gyurovGain: number; deltaVoted: number;
    yotovaDominantSections: number; gyurovDominantSections: number; tiedSections: number };
  stableList?: Omit<CandidateAnalysisSummary, 'stableList' | 'stableListSections'>;
}

export interface HistoryParty {
  id: string;
  name: string;
  votes: number;
  share: number | null;
  shareOfVoters: number | null;
}

export interface ForensicsSection {
  sectionId: string;
  regionId?: string;
  regionName?: string;
  municipalityName?: string;
  municipalityCode?: string;
  settlementName?: string;
  settlementEkatte?: string;
  address?: string;
  coordinates?: { latitude: number; longitude: number } | null;
  matches?: Record<string, ForensicsMatch>;
  roundMatch?: ForensicsMatch;
  latitude?: number | null;
  longitude?: number | null;
  geography?: Record<string, unknown>;
  elections: Record<string, ForensicsElection | null>;
  comparableRoundPair: boolean;
  exclusionReasons: string[];
  analysisExclusions?: string[];
  eligible?: boolean;
  registered1: number | null;
  registered2: number | null;
  voted1: number | null;
  voted2: number | null;
  turnout1: number | null;
  turnout2: number | null;
  deltaTurnoutPp: number | null;
  deltaTurnoutSensitivityPp: number | null;
  deltaVoted: number | null;
  added1?: number | null;
  added2?: number | null;
  deltaAdded?: number | null;
  addedPer100Voters1?: number | null;
  addedPer100Voters2?: number | null;
  addedReviewFlags?: string[];
  candidateReviewFlags?: string[];
  sizeGroup: string;
  method1: string;
  method2: string;
  priority: boolean;
  small400: boolean;
  candidateChanges: CandidateChange[];
  history: Record<string, {
    matched: boolean;
    verified?: boolean;
    eligibleForModel?: boolean;
    parties: HistoryParty[];
    gerbShare: number | null;
    dpsShare: number | null;
  }>;
  signal: {
    peerN: number;
    peerMedian: number | null;
    peerMad: number | null;
    robustZ: number | null;
    empiricalUpperTail: number | null;
    adjustedTail: number | null;
    flags: string[];
    alternativeExplanations: string[];
    neighborCount: number;
    neighborMean: number | null;
    spatialP: number | null;
    spatialQ: number | null;
  };
  [key: string]: unknown;
}

export interface ForensicsMatch {
  status: string;
  comparable: boolean;
  reasons: string[];
  identityChecks: Record<string, boolean | null>;
  possibleSplitMerge: boolean;
}

export interface ForensicsGroup {
  key: string;
  name: string;
  region?: string;
  municipalityCode?: string;
  settlementEkatte?: string;
  n: number;
  registered1: number;
  registered2: number;
  voted1: number;
  voted2: number;
  turnout1: number | null;
  turnout2: number | null;
  deltaTurnoutPp: number | null;
  meanDeltaPp: number | null;
  deltaVoted: number;
  eligibleN: number;
  flaggedN: number;
  smallN: number;
  candidateTotals?: CandidateVoteTotals[];
  added1?: number;
  added2?: number;
  deltaAdded?: number;
  addedReviewN?: number;
}

export interface ForensicsQuery {
  id: string;
  title: string;
  filter: unknown;
  summary: Record<string, unknown>;
  binSummary: ForensicsGroup[];
  methodSummary: ForensicsGroup[];
  findings: string[];
  clusterIds: string[];
  comparison: ForensicsComparison;
  hypotheses: ForensicsHypothesis[];
  clusters?: ForensicsCluster[];
  selectionSensitivity?: unknown;
  candidateAnalysis?: {
    summary: CandidateAnalysisSummary;
    hypotheses: ForensicsHypothesis[];
    methodology: unknown;
  };
  addedElectorReview?: AddedElectorReview[];
  candidateReview?: CandidateReview[];
  historicalRunoffs?: HistoricalRunoffBenchmark[];
  regions: ForensicsGroup[];
  municipalities: ForensicsGroup[];
  settlements: ForensicsGroup[];
  report: { facts: string[]; observations: string[]; hypotheses: string[] };
}

export interface ForensicsComparison {
  targetN: number;
  matchedN: number;
  uniqueControlN: number;
  meanDifferencePp: number | null;
  ci95: [number, number] | null;
  municipalities: number;
  pairs: unknown[];
  method: string;
  limitations: string[];
}

export interface ForensicsHypothesis {
  id: string;
  title: string;
  status: string;
  summary: string;
  n: number;
  estimate: number | null;
  unit: string;
  ci95: [number, number] | null;
  p: number | null;
  q: number | null;
  method: string;
  limitations: string[];
  details: Record<string, unknown>;
}

export interface ForensicsCluster {
  id: string;
  sectionIds: string[];
  siteCount: number;
  sectionCount: number;
  regionName: string;
  municipalityName: string;
  meanDeltaPp: number | null;
  p: number | null;
  q: number | null;
  status: string;
  definition: string;
  limitations: string[];
  targetSectionIds?: string[];
  targetSectionCount?: number;
}

export interface ForensicsFinding {
  sectionId: string;
  regionName: string;
  municipalityName: string;
  settlementName: string;
  deltaTurnoutPp: number;
  deltaVoted: number;
  registered1: number;
  registered2: number;
  voted1: number;
  voted2: number;
  turnout1: number;
  turnout2: number;
  robustZ: number | null;
  peerN: number;
  peerMedian: number | null;
  criteria: string[];
  calculations: string[];
  alternativeExplanations: string[];
  spatialQ: number | null;
  priority: boolean;
  small400: boolean;
  candidateChanges?: CandidateChange[];
}

export interface AddedElectorReview {
  sectionId: string;
  regionName: string;
  municipalityName: string;
  settlementName: string;
  added1: number | null;
  added2: number | null;
  voted1: number | null;
  voted2: number | null;
  addedPer100Voters1: number | null;
  addedPer100Voters2: number | null;
  deltaAdded: number | null;
  addedReviewFlags: string[];
  eligible: boolean;
}

export interface CandidateReview {
  sectionId: string;
  regionName: string;
  municipalityName: string;
  settlementName: string;
  deltaTurnoutPp: number | null;
  deltaVoted: number | null;
  candidateChanges: CandidateChange[];
  candidateReviewFlags: string[];
}

export interface HistoricalRunoffSummary {
  n: number;
  registered1: number;
  registered2: number;
  voted1: number;
  voted2: number;
  added1: number;
  added2: number;
  deltaVoted: number;
  turnout1: number | null;
  turnout2: number | null;
  deltaTurnoutPp: number | null;
  meanDeltaPp: number | null;
  finalists: {
    name: string;
    ballot1: string;
    ballot2: string;
    votes1: number;
    votes2: number;
    deltaVotes: number;
    share1: number | null;
    share2: number | null;
    deltaSharePp?: number | null;
  }[];
}

export interface HistoricalRunoffBenchmark extends HistoricalRunoffSummary {
  cycle: number;
  round1Date: string;
  round2Date: string;
  sections: number;
  eligibleN?: number;
  excludedN: number;
  stableListSensitivity: HistoricalRunoffSummary;
  regions: (HistoricalRunoffSummary & { regionId: string; regionName: string })[];
  quality: Record<string, unknown>;
  sources: { date: string; sourceUrl: string; archiveSha256?: string | null; trustStatus: string; freshArchiveVerification?: boolean; sourceDocumentationUrl?: string; canonicalHashes?: Record<string, string> }[];
  cohortDefinition: string;
  matchingConfidence: string;
  limitations: string[];
  context?: string;
  contextSourceUrl?: string;
}

export interface ForensicsReport {
  metadata: Record<string, unknown>;
  definitions: Record<string, unknown>;
  quality: Record<string, unknown>;
  provenance: unknown;
  query1: ForensicsQuery;
  query2: ForensicsQuery;
  regions: ForensicsGroup[];
  municipalities: ForensicsGroup[];
  settlements: ForensicsGroup[];
  hypotheses: ForensicsHypothesis[];
  clusters: ForensicsCluster[];
  findings: ForensicsFinding[];
  methodology: unknown;
  registrations?: Record<string, { parties: Record<string, string>; regionalParties: Record<string, string> }>;
  sampleSensitivity?: unknown;
}

export type SectionSort = 'sectionId' | 'registered1' | 'voted1' | 'voted2' | 'turnout1' | 'turnout2' | 'deltaTurnoutPp' | 'deltaVoted' | 'candidate4Delta' | 'candidate25Delta' | 'deltaAdded';
export interface SectionFilters {
  focus: boolean;
  regionId: string;
  search: string;
  size: string;
  method: string;
  comparableOnly: boolean;
  flaggedOnly: boolean;
  sort: SectionSort;
  descending: boolean;
}
