import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreatePositionDto) {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('Position name is required.');
    const color = dto?.color?.trim() || '#64748b';
    if (!HEX_COLOR_RE.test(color)) throw new BadRequestException('Position color must be HEX (e.g. #64748b).');

    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) throw new BadRequestException('Position already exists.');

    return this.prisma.role.create({ data: { name, color } });
  }

  async update(id: string, dto: UpdatePositionDto) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Position not found.');

    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('Position name is required.');
    const color = dto?.color?.trim() || existing.color;
    if (!HEX_COLOR_RE.test(color)) throw new BadRequestException('Position color must be HEX (e.g. #64748b).');

    return this.prisma.role.update({ where: { id }, data: { name, color } });
  }

  async remove(id: string) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Position not found.');

    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }
}
