import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CsvError = { line: number; message: string };

export type CsvParseResult<TRow> = {
  rows: TRow[];
  errors: CsvError[];
  total: number;
};

export type CsvRowContext = {
  line: string;
  lineNumber: number;
  cols: string[];
  has: (key: string) => boolean;
  get: (key: string) => string;
};

export type CsvRowParseResult<TRow> = {
  row?: TRow;
  error?: string;
};

export abstract class ElectionCsvBaseService {
  constructor(protected readonly prisma: PrismaService) {}

  protected fileToText(file: { buffer: Buffer }): string {
    return file.buffer.toString('utf-8');
  }

  protected async ensureElection(electionId: string): Promise<void> {
    const exists = await this.prisma.election.findUnique({ where: { id: electionId } });
    if (!exists) throw new NotFoundException('Election not found.');
  }

  protected parseCsvRows<TRow>(
    text: string,
    options: {
      requiredHeaders: string[];
      limit?: number;
      parseRow: (context: CsvRowContext) => CsvRowParseResult<TRow>;
    },
  ): CsvParseResult<TRow> {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return { rows: [], errors: [{ line: 1, message: 'Empty file.' }], total: 0 };
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const rawHeaders = lines[0].split(delimiter).map((h) => h.trim());
    const headers = rawHeaders.map((h) => this.normalizeHeader(h));

    const headerIndex: Record<string, number> = {};
    headers.forEach((header, index) => {
      if (!(header in headerIndex)) headerIndex[header] = index;
    });

    const missing = options.requiredHeaders.filter((header) => headerIndex[header] === undefined);
    if (missing.length > 0) {
      return {
        rows: [],
        errors: [{ line: 1, message: `Missing required headers: ${missing.join(', ')}` }],
        total: 0,
      };
    }

    const rows: TRow[] = [];
    const errors: CsvError[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (options.limit && rows.length >= options.limit) break;

      const line = lines[i];
      const cols = line.split(delimiter).map((col) => col.trim());
      const context: CsvRowContext = {
        line,
        lineNumber: i + 1,
        cols,
        has: (key: string) => headerIndex[key] !== undefined,
        get: (key: string) => cols[headerIndex[key]] || '',
      };

      const parsed = options.parseRow(context);
      if (parsed.error) {
        errors.push({ line: context.lineNumber, message: parsed.error });
        continue;
      }
      if (parsed.row) {
        rows.push(parsed.row);
      }
    }

    return { rows, errors, total: lines.length - 1 };
  }

  protected buildPreview<TRow, TSample = TRow>(
    parsed: CsvParseResult<TRow>,
    mapSample?: (row: TRow) => TSample,
    sampleSize = 20,
  ): {
    total: number;
    valid: number;
    invalid: number;
    errors: CsvError[];
    samples: TSample[];
  } {
    const samplesSource = parsed.rows.slice(0, sampleSize);
    return {
      total: parsed.total,
      valid: parsed.rows.length,
      invalid: parsed.errors.length,
      errors: parsed.errors,
      samples: mapSample ? samplesSource.map(mapSample) : (samplesSource as unknown as TSample[]),
    };
  }

  private normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private detectDelimiter(line: string): string {
    const semicolonCount = (line.match(/;/g) || []).length;
    const commaCount = (line.match(/,/g) || []).length;
    return semicolonCount >= commaCount ? ';' : ',';
  }
}
