export interface ComparativeValue {
  v: number;
  d: string;
}

export interface PartyVotes {
  total: number;
  paper: number;
  machine: number;
  comparisons?: ComparativeValue[];
  percentComparisons?: ComparativeValue[];
  paperComparisons?: ComparativeValue[];
  machineComparisons?: ComparativeValue[];
}

export interface CandidateVotes {
  candidateId: string;
  candidateName: string;
  partyId: string;
  partyName: string;
  total: number;
  paper: number;
  machine: number;
}

export interface Region {
  id: string;
  name: string;
  total: number;
  voted: number;
  partyVotes: { [key: string]: number };
  topParties?: { partyId: string, name: string, total: number, percentBp: number }[];
  discardedVotes?: number;
  noVotes?: number;
  totalPaper?: number;
  totalMachine?: number;
  avgTurnoutBp?: number;
  partyPercentsBp?: { [key: string]: number };
  comparisons?: { [key: string]: ComparativeValue[] };
}

export interface Section {
  sectionId: string;
  regionId: string;
  regionName?: string;
  municipalityName?: string;
  settlementEkatte?: string;
  cityName: string;
  sectionName: string;
  sectionType: string;
  total: number;
  voted: number;
  discardedVotes: number;
  noVotes: number;
  noVotesPaper?: number;
  noVotesMachine?: number;
  partyVotes: { [key: string]: PartyVotes };
  candidateVotes?: { [key: string]: CandidateVotes };
  topParties: { partyId: string, name: string, total: number, percentBp: number }[];
  activityBp: number;
  totalPaper?: number;
  totalMachine?: number;
  hasProtocolError?: boolean;
  protocolErrorDiff?: number;
  protocolPaperVotes?: number;
  protocolMachineVotes?: number;
  riskScore?: number;
  riskIndicators?: Array<{ code: string; category: string; severity: string; details?: any }>;
  votesToFirst?: number;
  comparisons?: { [key: string]: ComparativeValue[] };
}

export interface PartyResult {
  partyId: string;
  partyName: string;
  total: number;
  paper: number;
  machine: number;
  percent: number;
  percentBp: number;
  isOthers?: boolean;
  isNoVotes?: boolean;
  comparisons?: ComparativeValue[];
  percentComparisons?: ComparativeValue[];
  paperComparisons?: ComparativeValue[];
  machineComparisons?: ComparativeValue[];
}

export interface CandidateResult {
  candidateId: string;
  candidateName: string;
  partyId: string;
  partyName: string;
  paper: number;
  machine: number;
  total: number;
  percentInSection: number;
  partyPercentInSection: number;
  totalInRegion: number;
  partyPercentInRegion: number;
  comparisons?: ComparativeValue[] | string;
  paperComparisons?: ComparativeValue[] | string;
  machineComparisons?: ComparativeValue[] | string;
}

export interface RegionCandidate {
  candidateId: string;
  candidateName: string;
  partyId: string;
  partyName: string;
  paper: number;
  machine: number;
  total: number;
  totalInRegion: number;
  partyPercentInRegion: number;
  preferencePercentOfPartyVotes: number; // Percentage of party votes in region that are preferences for this candidate
  riskIndicators?: Array<{ code: string; category: string; severity: string; details?: { sectionId: string } }>;
  comparisons?: ComparativeValue[] | string;
  paperComparisons?: ComparativeValue[] | string;
  machineComparisons?: ComparativeValue[] | string;
}

export interface SectionDetails {
  sectionId: string;
  cityName: string;
  sectionName: string;
  partyResults: PartyResult[];
  candidateResults?: CandidateResult[];
  votesWithoutPreferences?: number;
  votesWithoutPreferencesByParty?: { [partyId: string]: { total: number, paper: number, machine: number } };
  candidateVotes?: { [key: string]: CandidateVotes };
}

export interface TableColumn {
  id: string;
  label: string;
}

export const SECTION_COLUMNS: TableColumn[] = [
  { id: 'sectionId', label: 'Секция' },
  { id: 'riskScore', label: 'Рискове' },
  { id: 'regionName', label: 'Регион' },
  { id: 'municipalityName', label: 'Община' },
  { id: 'cityName', label: 'Населено място' },
  { id: 'sectionName', label: 'Име на секция' },
  { id: 'total', label: 'Избиратели' },
  { id: 'voted', label: 'Гласували' },
  { id: 'activityBp', label: 'Активност' },
  { id: 'discardedVotes', label: 'Невалидни' },
  { id: 'noVotes', label: 'Не подкрепя никого' },
  { id: 'typeVotes', label: 'Гласове по тип' },
  { id: 'votesToFirst', label: 'Нужни' },
  { id: 'topParties', label: 'Топ 3 партии' },
  { id: 'topCandidates', label: 'Топ 3 преференции' },
];

export type SectionTab = 'all' | 'target' | 'swing' | 'risky' | 'outside' | 'declining' | 'dormant' | 'flip' | 'vanishing';
export type ViewMode = 'sections' | 'cities' | 'municipalities' | 'candidates' | 'map';

export interface SectionFilters {
  searchTerm: string;
  activeTab: SectionTab;
  activityOperator: 'lte' | 'gte';
  lowActivityThreshold: number | null;
  sectionTypes: Set<string>;
  riskFilterType?: 'any' | 'none' | null;
  selectedRiskCategories?: Set<string>; // R1, R2, R3, R4
  isViewingAllSections?: boolean;
}
