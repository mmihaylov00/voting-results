import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAssignmentDto) {
    await this.ensureElection(dto.electionId);
    await this.ensureRefs(dto.electionId, dto.personId, dto.electionSectionId, dto.positionId);
    await this.ensureHardBlock(dto.electionId, dto.personId, dto.electionSectionId, dto.positionId);

    return this.prisma.assignment.create({
      data: {
        electionId: dto.electionId,
        personId: dto.personId,
        electionSectionId: dto.electionSectionId,
        roleId: dto.positionId,
      },
    });
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found.');

    const electionId = existing.electionId;
    const personId = dto.personId ?? existing.personId;
    const electionSectionId = dto.electionSectionId ?? existing.electionSectionId;
    const positionId = dto.positionId ?? existing.roleId;

    await this.ensureRefs(electionId, personId, electionSectionId, positionId);
    await this.ensureHardBlock(electionId, personId, electionSectionId, positionId, id);

    return this.prisma.assignment.update({
      where: { id },
      data: { personId, electionSectionId, roleId: positionId },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found.');

    await this.prisma.assignment.delete({ where: { id } });
    return { ok: true };
  }

  async list(electionId: string) {
    await this.ensureElection(electionId);
    return this.prisma.assignment.findMany({
      where: { electionId },
      include: {
        person: true,
        role: true,
        section: true,
      },
      orderBy: { createdAt: 'desc' },
    }).then((rows) =>
      rows.map((row) => ({
        ...row,
        position: row.role,
      })),
    );
  }

  async peopleWithoutSection(electionId: string, positionId: string) {
    await this.ensureElection(electionId);

    const assignedPersonIds = await this.prisma.assignment.findMany({
      where: { electionId, roleId: positionId },
      select: { personId: true },
    });

    const ids = assignedPersonIds.map((r) => r.personId);
    return this.prisma.person.findMany({
      where: { electionId, id: { notIn: ids } },
      orderBy: { fullName: 'asc' },
    });
  }

  async sectionsMissingPosition(electionId: string, positionId: string) {
    await this.ensureElection(electionId);

    const assignedSectionIds = await this.prisma.assignment.findMany({
      where: { electionId, roleId: positionId },
      select: { electionSectionId: true },
    });

    const ids = assignedSectionIds.map((r) => r.electionSectionId);
    return this.prisma.electionSection.findMany({
      where: { electionId, id: { notIn: ids } },
      orderBy: { sectionId: 'asc' },
    });
  }

  private async ensureElection(electionId: string) {
    const exists = await this.prisma.election.findUnique({ where: { id: electionId } });
    if (!exists) throw new NotFoundException('Election not found.');
  }

  private async ensureRefs(electionId: string, personId: string, electionSectionId: string, positionId: string) {
    const [person, section, position] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: personId } }),
      this.prisma.electionSection.findUnique({ where: { id: electionSectionId } }),
      this.prisma.role.findUnique({ where: { id: positionId } }),
    ]);

    if (!person || person.electionId !== electionId) {
      throw new BadRequestException('Person not found for election.');
    }
    if (!section || section.electionId !== electionId) {
      throw new BadRequestException('Section not found for election.');
    }
    if (!position) {
      throw new BadRequestException('Position not found.');
    }
  }

  private async ensureHardBlock(
    electionId: string,
    personId: string,
    electionSectionId: string,
    positionId: string,
    ignoreAssignmentId?: string,
  ) {
    const existing = await this.prisma.assignment.findFirst({
      where: {
        electionId,
        OR: [
          { personId },
          { electionSectionId, roleId: positionId },
        ],
        ...(ignoreAssignmentId ? { id: { not: ignoreAssignmentId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Assignment conflict detected.');
    }
  }
}
