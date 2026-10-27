export interface ContextSource {
  publisher: string;
  url: string;
  repository: string;
  retrievedAt: string;
  sha256: string;
}

export const DEMOGRAPHIC_METRICS = {
  ethnicBulgarian: { label: 'Българска етническа група', group: 'ethnicity' },
  ethnicTurkish: { label: 'Турска етническа група', group: 'ethnicity' },
  ethnicRoma: { label: 'Ромска етническа група', group: 'ethnicity' },
  religionChristian: { label: 'Християнско вероизповедание', group: 'religion' },
  religionMuslim: { label: 'Мюсюлманско вероизповедание', group: 'religion' },
  religionNoneOrUndecl: { label: 'Без вероизповедание', group: 'religion' },
  eduTertiary: { label: 'Висше образование', group: 'education' },
  eduSecondary: { label: 'Средно или висше образование', group: 'education' },
  eduPrimaryOrLower: { label: 'Начално или по-ниско образование', group: 'education' },
  ageUnder15: { label: 'Под 15 години', group: 'age' },
  age15_29: { label: '15-29 години', group: 'age' },
  age30_44: { label: '30-44 години', group: 'age' },
  age45_64: { label: '45-64 години', group: 'age' },
  age65plus: { label: '65 и повече години', group: 'age' },
  genderFemale: { label: 'Жени', group: 'gender' },
  employmentRate: { label: 'Заетост', group: 'economy' },
  unemploymentRate: { label: 'Безработица', group: 'economy' },
  activityRate: { label: 'Икономическа активност', group: 'economy' },
} as const;

export interface DemographicData {
  date: string;
  source: ContextSource;
  censusDate: string;
  censusSourceUrl: string;
  parties: { id: string; name: string }[];
  rows: { metric: keyof typeof DEMOGRAPHIC_METRICS; correlations: number[] }[];
}

export interface AgencyComparison {
  id: string;
  name: string;
  website: string | null;
  pollId: string;
  sourceUrl: string;
  fieldwork: string;
  fieldworkEnd: string;
  daysBefore: number;
  respondents: number | null;
  mae: number;
  deduplicated: number;
  normalized: boolean;
  redistributed: number;
  methodology: string | null;
  errors: { party: string; polled: number; published: number; actual: number; error: number }[];
}

export interface PollingData {
  date: string;
  source: ContextSource;
  generatedAt: string;
  agencies: AgencyComparison[];
}

export interface VoteFlowNode {
  id: string;
  name: string;
  votes: number;
  pseudo: boolean;
}

export interface VoteFlowData {
  date: string;
  from: string;
  source: ContextSource;
  generatedAt: string;
  fromNodes: VoteFlowNode[];
  toNodes: VoteFlowNode[];
  flows: { from: string; to: string; votes: number }[];
  sectionsMatched: number;
  sectionsDropped: number;
  residual: number;
  maxNodeExcess: number;
}
