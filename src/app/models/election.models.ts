export interface PartyVotes {
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
  topParties?: { name: string, total: number, percent: number }[];
  discardedVotes?: number;
  noVotes?: number;
  totalPaper?: number;
  totalMachine?: number;
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
  topParties: { name: string, total: number, percent: number }[];
  activityPercent: number;
  totalPaper?: number;
  totalMachine?: number;
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
