export interface ComparativeValue {
  value: number;
  date: string;
  dateName: string;
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

export interface Region {
  id: string;
  name: string;
  total: number;
  voted: number;
  partyVotes: { [key: string]: number };
  topParties?: { name: string, total: number, percent: number, comparisons?: ComparativeValue[] }[];
  discardedVotes?: number;
  noVotes?: number;
  totalPaper?: number;
  totalMachine?: number;
  comparisons?: { [key: string]: ComparativeValue[] };
}

export interface Section {
  sectionId: string;
  regionId: string;
  cityName: string;
  sectionName: string;
  total: number;
  voted: number;
  discardedVotes: number;
  noVotes: number;
  noVotesPaper?: number;
  noVotesMachine?: number;
  partyVotes: { [key: string]: PartyVotes };
  topParties: { name: string, total: number, percent: number, comparisons?: ComparativeValue[] }[];
  activityPercent: number;
  totalPaper?: number;
  totalMachine?: number;
  hasProtocolError?: boolean;
  protocolErrorDiff?: number;
  protocolPaperVotes?: number;
  protocolMachineVotes?: number;
  comparisons?: { [key: string]: ComparativeValue[] };
}

export interface PartyResult {
  partyId: string;
  partyName: string;
  total: number;
  paper: number;
  machine: number;
  percent: number;
}

export interface SectionDetails {
  sectionId: string;
  cityName: string;
  sectionName: string;
  partyResults: PartyResult[];
}
