import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { APP_ROLE, AppRole, isAppRole } from '@votes/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      roles: [u.role],
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  async create(dto: CreateUserDto) {
    const email = dto?.email?.trim().toLowerCase();
    if (!email || !dto?.password) {
      throw new BadRequestException('Email and password are required.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const role = this.normalizeRole(dto.role);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name?.trim(),
        role,
      },
    });

    return this.findPublic(user.id);
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    const email = dto.email?.trim().toLowerCase();
    const data: { email?: string; passwordHash?: string; name?: string; role?: AppRole } = {};

    if (email) {
      data.email = email;
    }

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.name !== undefined) {
      data.name = dto.name?.trim();
    }

    if (dto.role !== undefined) {
      data.role = this.normalizeRole(dto.role);
    }

    await this.prisma.user.update({ where: { id }, data });
    return this.findPublic(id);
  }

  async remove(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  private async findPublic(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: [user.role],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private normalizeRole(role?: string): AppRole {
    const normalized = (role || APP_ROLE.VIEWER).trim();
    if (!isAppRole(normalized)) {
      throw new BadRequestException('Role is invalid.');
    }
    return normalized;
  }
}
