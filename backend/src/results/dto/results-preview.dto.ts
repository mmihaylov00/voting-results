export type ResultsPreviewDto = {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ line: number; message: string }>;
  samples: Array<{
    sectionId: string;
    data: Record<string, unknown>;
  }>;
};
