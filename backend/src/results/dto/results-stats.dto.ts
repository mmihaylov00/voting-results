export type ResultsStatsDto = {
  electionDate: string;
  totalSections: number;
  resultsCount: number;
  missingSectionIds: string[];
  extraSectionIds: string[];
};
