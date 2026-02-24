export type ResultsRowDto = {
  sectionId: string;
  regionId: string;
  regionName: string;
  municipalityId?: string;
  cityName: string;
  sectionName: string;
  sectionType?: string;
  extras: Record<string, string>;
};
