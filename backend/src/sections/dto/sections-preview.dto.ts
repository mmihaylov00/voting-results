export type SectionsPreviewDto = {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ line: number; message: string }>;
  samples: Array<{
    sectionId: string;
    regionId: string;
    regionName: string;
    municipalityId?: string;
    cityName: string;
    sectionName: string;
    sectionType?: string;
  }>;
};
