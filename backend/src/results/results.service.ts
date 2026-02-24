import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ResultsPreviewDto } from './dto/results-preview.dto';
import { ResultsStatsDto } from './dto/results-stats.dto';
import { ResultsRowDto } from './dto/results-row.dto';

const REQUIRED_HEADERS = ['sectionid', 'regionid', 'regionname', 'cityname', 'sectionname'];
const OPTIONAL_HEADERS = ['municipalityid', 'sectiontype'];

function detectDelimiter(line: string): string {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(electionId: string, electionDate: string, file: { buffer: Buffer }): Promise<ResultsPreviewDto> {
    await this.ensureElection(electionId);
    const text = file.buffer.toString('utf-8');
    return this.parsePreview(text);
  }

  async upload(electionId: string, electionDate: string, file: { buffer: Buffer }): Promise<{ ok: true; imported: number }> {
    await this.ensureElection(electionId);

    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(electionDate)) {
      throw new BadRequestException('Election date must be in YYYY.MM.DD format.');
    }

    const text = file.buffer.toString('utf-8');
    const { rows, errors } = this.parseRows(text);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid rows in CSV', errors });
    }

    const sections = await this.prisma.electionSection.findMany({
      where: { electionId },
      select: { id: true, sectionId: true },
    });
    const sectionById = new Map(sections.map((s) => [s.sectionId, s.id]));

    const dataToInsert = rows.map((row) => {
      const electionSectionId = sectionById.get(row.sectionId);
      if (!electionSectionId) {
        throw new BadRequestException(`SectionId ${row.sectionId} not found in election.`);
      }
      return {
        electionId,
        electionSectionId,
        electionDate,
        data: row,
      };
    });

    await this.prisma.electionResult.deleteMany({
      where: { electionId, electionDate },
    });

    const result = await this.prisma.electionResult.createMany({ data: dataToInsert });
    return { ok: true, imported: result.count };
  }

  async getElectionResults(electionId: string, electionDate: string) {
    await this.ensureElection(electionId);
    return this.prisma.electionResult.findMany({
      where: { electionId, electionDate },
      include: { section: true },
    });
  }

  async getStats(electionId: string, electionDate: string): Promise<ResultsStatsDto> {
    await this.ensureElection(electionId);

    const sections = await this.prisma.electionSection.findMany({
      where: { electionId },
      select: { sectionId: true },
    });

    const results = await this.prisma.electionResult.findMany({
      where: { electionId, electionDate },
      select: { section: { select: { sectionId: true } } },
    });

    const sectionIds = new Set(sections.map((s) => s.sectionId));
    const resultIds = new Set(results.map((r) => r.section.sectionId));

    const missingSectionIds = Array.from(sectionIds).filter((id) => !resultIds.has(id));
    const extraSectionIds = Array.from(resultIds).filter((id) => !sectionIds.has(id));

    return {
      electionDate,
      totalSections: sections.length,
      resultsCount: results.length,
      missingSectionIds,
      extraSectionIds,
    };
  }

  private async ensureElection(electionId: string) {
    const exists = await this.prisma.election.findUnique({ where: { id: electionId } });
    if (!exists) throw new NotFoundException('Election not found.');
  }

  private parsePreview(text: string): ResultsPreviewDto {
    const { rows, errors, total } = this.parseRows(text, 20);
    const valid = rows.length;
    const invalid = errors.length;

    return {
      total,
      valid,
      invalid,
      errors,
      samples: rows.slice(0, 20).map((r) => ({ sectionId: r.sectionId, data: r })),
    };
  }

  private parseRows(text: string, limit?: number): { rows: Array<ResultsRowDto>; errors: Array<{ line: number; message: string }>; total: number } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { rows: [], errors: [{ line: 1, message: 'Empty file.' }], total: 0 };
    }

    const delimiter = detectDelimiter(lines[0]);
    const rawHeaders = lines[0].split(delimiter).map((h) => h.trim());
    const headers = rawHeaders.map(normalizeHeader);

    const headerIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (!(h in headerIndex)) headerIndex[h] = i;
    });

    const missing = REQUIRED_HEADERS.filter((h) => headerIndex[h] === undefined);
    if (missing.length > 0) {
      return {
        rows: [],
        errors: [{ line: 1, message: `Missing required headers: ${missing.join(', ')}` }],
        total: 0,
      };
    }

    const rows: Array<ResultsRowDto> = [];
    const errors: Array<{ line: number; message: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      if (limit && rows.length >= limit) break;

      const line = lines[i];
      const cols = line.split(delimiter).map((c) => c.trim());
      const get = (key: string) => cols[headerIndex[key]] || '';

      const sectionId = get('sectionid');
      const regionId = get('regionid');
      const regionName = get('regionname');
      const cityName = get('cityname');
      const sectionName = get('sectionname');
      const municipalityId = headerIndex['municipalityid'] !== undefined ? get('municipalityid') : undefined;
      const sectionType = headerIndex['sectiontype'] !== undefined ? get('sectiontype') : undefined;

      const lineNumber = i + 1;
      if (!sectionId || !regionId || !regionName || !cityName || !sectionName) {
        errors.push({ line: lineNumber, message: 'Missing required fields.' });
        continue;
      }

      const extras: Record<string, string> = {};
      rawHeaders.forEach((h, idx) => {
        const normalized = headers[idx];
        if (REQUIRED_HEADERS.includes(normalized) || OPTIONAL_HEADERS.includes(normalized)) return;
        extras[h] = cols[idx] || '';
      });

      rows.push({
        sectionId,
        regionId,
        regionName,
        municipalityId,
        cityName,
        sectionName,
        sectionType,
        extras,
      });
    }

    return { rows, errors, total: lines.length - 1 };
  }
}
