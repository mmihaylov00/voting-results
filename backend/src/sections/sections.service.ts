import { BadRequestException, Injectable } from '@nestjs/common';
import { ElectionCsvBaseService } from '../common/csv/election-csv-base.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SectionsPreviewDto } from './dto/sections-preview.dto';

const REQUIRED_HEADERS = ['sectionid', 'regionid', 'regionname', 'cityname', 'sectionname'];

type SectionRow = {
  sectionId: string;
  regionId: string;
  regionName: string;
  municipalityId?: string;
  cityName: string;
  sectionName: string;
  sectionType?: string;
};

@Injectable()
export class SectionsService extends ElectionCsvBaseService {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async preview(electionId: string, file: { buffer: Buffer }): Promise<SectionsPreviewDto> {
    await this.ensureElection(electionId);
    const text = this.fileToText(file);
    const parsed = this.parseRows(text, 20);
    return this.buildPreview(parsed);
  }

  async upload(electionId: string, file: { buffer: Buffer }): Promise<{ ok: true; imported: number }> {
    await this.ensureElection(electionId);
    const text = this.fileToText(file);
    const { rows, errors } = this.parseRows(text);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid rows in CSV', errors });
    }

    await this.prisma.electionSection.deleteMany({ where: { electionId } });
    const result = await this.prisma.electionSection.createMany({
      data: rows.map((row) => ({
        electionId,
        sectionId: row.sectionId,
        regionId: row.regionId,
        regionName: row.regionName,
        municipalityId: row.municipalityId || null,
        cityName: row.cityName,
        sectionName: row.sectionName,
        sectionType: row.sectionType || null,
      })),
    });

    return { ok: true, imported: result.count };
  }

  async list(electionId: string) {
    await this.ensureElection(electionId);
    return this.prisma.electionSection.findMany({
      where: { electionId },
      orderBy: { sectionId: 'asc' },
    });
  }

  private parseRows(text: string, limit?: number) {
    const seenSectionIds = new Set<string>();

    return this.parseCsvRows<SectionRow>(text, {
      requiredHeaders: REQUIRED_HEADERS,
      limit,
      parseRow: ({ get, has }) => {
        const sectionId = get('sectionid');
        const regionId = get('regionid');
        const regionName = get('regionname');
        const cityName = get('cityname');
        const sectionName = get('sectionname');
        const municipalityId = has('municipalityid') ? get('municipalityid') : undefined;
        const sectionType = has('sectiontype') ? get('sectiontype') : undefined;

        if (!sectionId || !regionId || !regionName || !cityName || !sectionName) {
          return { error: 'Missing required fields.' };
        }

        if (seenSectionIds.has(sectionId)) {
          return { error: `Duplicate sectionId ${sectionId}.` };
        }
        seenSectionIds.add(sectionId);

        return {
          row: {
            sectionId,
            regionId,
            regionName,
            municipalityId,
            cityName,
            sectionName,
            sectionType,
          },
        };
      },
    });
  }
}
