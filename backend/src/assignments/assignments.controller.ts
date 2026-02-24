import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Controller('elections/manage/:electionId/assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  async list(@Param('electionId') electionId: string) {
    return this.assignmentsService.list(electionId);
  }

  @Get('people-without-section')
  async peopleWithoutSection(@Param('electionId') electionId: string, @Query('positionId') positionId: string) {
    return this.assignmentsService.peopleWithoutSection(electionId, positionId);
  }

  @Get('sections-missing-position')
  async sectionsMissingPosition(@Param('electionId') electionId: string, @Query('positionId') positionId: string) {
    return this.assignmentsService.sectionsMissingPosition(electionId, positionId);
  }

  @Post()
  async create(@Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignmentsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.assignmentsService.remove(id);
  }
}
