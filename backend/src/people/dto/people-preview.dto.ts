export type PeoplePreviewDto = {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ line: number; message: string }>;
  samples: Array<{
    fullName: string;
    email?: string;
    phone?: string;
    externalId?: string;
  }>;
};
