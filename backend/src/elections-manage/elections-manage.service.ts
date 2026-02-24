import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateElectionDto } from './dto/update-election.dto';
import { electionNameFromDate } from '../common/date/election-name.util';

const DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

@Injectable()
export class ElectionsManageService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.election.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        name: true,
      },
    });
  }

  async get(id: string) {
    const election = await this.prisma.election.findUnique({ where: { id } });
    if (!election) throw new NotFoundException('Election not found.');
    return election;
  }

  async create(dto: CreateElectionDto) {
    const date = dto?.date?.trim();
    if (!date || !DATE_RE.test(date)) {
      throw new BadRequestException('Date must be in YYYY.MM.DD format.');
    }

    return this.prisma.election.create({
      data: {
        date,
        name: electionNameFromDate(date),
      },
    });
  }

  async update(id: string, dto: UpdateElectionDto) {
    const existing = await this.prisma.election.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Election not found.');

    const data: { date?: string; name?: string } = {};

    if (dto.date !== undefined) {
      const date = dto.date?.trim();
      if (!date || !DATE_RE.test(date)) {
        throw new BadRequestException('Date must be in YYYY.MM.DD format.');
      }
      data.date = date;
    }

    if (dto.name !== undefined || dto.date !== undefined) {
      data.name = electionNameFromDate(data.date ?? existing.date);
    }

    return this.prisma.election.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.election.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Election not found.');

    await this.prisma.election.delete({ where: { id } });
    return { ok: true };
  }
}
