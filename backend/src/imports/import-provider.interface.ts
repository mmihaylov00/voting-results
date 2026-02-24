export type ImportSource = 'csv' | 'crm';

export type ImportResult<T> = {
  items: T[];
  errors: Array<{ line: number; message: string }>;
};

export interface ImportProvider<T> {
  source: ImportSource;
  preview(data: Buffer): Promise<ImportResult<T>>;
  parse(data: Buffer): Promise<ImportResult<T>>;
}
