import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { ElectionsService } from './elections.service';

@Controller('elections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN, APP_ROLE.VIEWER, APP_ROLE.CAMPAIGN_MANAGER)
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  @Get()
  async list() {
    return this.electionsService.list();
  }

  @Get('compact-mapping')
  compactMapping() {
    return this.electionsService.getCompactMapping();
  }

  @Get(':date/summary')
  async summary(@Param('date') date: string) {
    return this.electionsService.getSummary(date);
  }

  @Get(':date/full')
  async full(@Param('date') date: string) {
    return this.electionsService.getFull(date);
  }

  @Get(':date/sections')
  async sections(@Param('date') date: string) {
    return this.electionsService.getSections(date);
  }

  @Get(':date/sections/:sectionId')
  async sectionDetail(@Param('date') date: string, @Param('sectionId') sectionId: string) {
    return this.electionsService.getSectionDetail(date, sectionId);
  }
}
