import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { ElectionsManageService } from './elections-manage.service';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateElectionDto } from './dto/update-election.dto';

@Controller('elections/manage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
export class ElectionsManageController {
  constructor(private readonly electionsManageService: ElectionsManageService) {}

  @Get()
  async list() {
    return this.electionsManageService.list();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.electionsManageService.get(id);
  }

  @Post()
  @Roles(APP_ROLE.ADMIN)
  async create(@Body() dto: CreateElectionDto) {
    return this.electionsManageService.create(dto);
  }

  @Patch(':id')
  @Roles(APP_ROLE.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateElectionDto) {
    return this.electionsManageService.update(id, dto);
  }

  @Delete(':id')
  @Roles(APP_ROLE.ADMIN)
  async remove(@Param('id') id: string) {
    return this.electionsManageService.remove(id);
  }
}
