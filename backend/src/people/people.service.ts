import { BadRequestException, Injectable } from '@nestjs/common';
import { ElectionCsvBaseService } from '../common/csv/election-csv-base.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PeoplePreviewDto } from './dto/people-preview.dto';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

const REQUIRED_HEADERS = ['fullname'];

type PersonRow = {
  fullName: string;
  email?: string;
  phone?: string;
  externalId?: string;
};

@Injectable()
export class PeopleService extends ElectionCsvBaseService {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async preview(electionId: string, file: { buffer: Buffer }): Promise<PeoplePreviewDto> {
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

    await this.prisma.person.deleteMany({ where: { electionId } });
    const result = await this.prisma.person.createMany({
      data: rows.map((row) => ({
        electionId,
        fullName: row.fullName,
        email: row.email || null,
        phone: row.phone || null,
        externalId: row.externalId || null,
      })),
    });

    return { ok: true, imported: result.count };
  }

  async list(electionId: string) {
    await this.ensureElection(electionId);
    return this.prisma.person.findMany({
      where: { electionId },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(electionId: string, dto: CreatePersonDto) {
    await this.ensureElection(electionId);
    const fullName = dto.fullName?.trim();
    if (!fullName) {
      throw new BadRequestException('fullName is required.');
    }

    return this.prisma.person.create({
      data: {
        electionId,
        fullName,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
      },
    });
  }

  async update(electionId: string, personId: string, dto: UpdatePersonDto) {
    await this.ensureElection(electionId);
    const existing = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!existing || existing.electionId !== electionId) {
      throw new BadRequestException('Person not found for election.');
    }

    const fullName = dto.fullName?.trim();
    if (!fullName) {
      throw new BadRequestException('fullName is required.');
    }

    return this.prisma.person.update({
      where: { id: personId },
      data: {
        fullName,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
      },
    });
  }

  async remove(electionId: string, personId: string) {
    await this.ensureElection(electionId);
    const existing = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!existing || existing.electionId !== electionId) {
      throw new BadRequestException('Person not found for election.');
    }

    await this.prisma.person.delete({ where: { id: personId } });
    return { ok: true };
  }

  private parseRows(text: string, limit?: number) {
    return this.parseCsvRows<PersonRow>(text, {
      requiredHeaders: REQUIRED_HEADERS,
      limit,
      parseRow: ({ get, has }) => {
        const fullName = get('fullname');
        const email = has('email') ? get('email') : undefined;
        const phone = has('phone') ? get('phone') : undefined;
        const externalId = has('externalid') ? get('externalid') : undefined;

        if (!fullName) {
          return { error: 'Missing fullName.' };
        }

        return {
          row: {
            fullName,
            email,
            phone,
            externalId,
          },
        };
      },
    });
  }
}
