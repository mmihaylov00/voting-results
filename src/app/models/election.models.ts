export interface PartyVotes {
  total: number;
  paper: number;
  machine: number;
}

export interface Region {
  id: string;
  name: string;
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
  partyVotes: { [key: string]: PartyVotes };
  topParties: { name: string, total: number, percent: number }[];
  activityPercent: number;
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
