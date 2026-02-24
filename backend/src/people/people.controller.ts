import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Controller('elections/manage/:electionId/people')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN)
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  @Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
  async list(@Param('electionId') electionId: string) {
    return this.peopleService.list(electionId);
  }

  @Post()
  @Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
  async create(@Param('electionId') electionId: string, @Body() dto: CreatePersonDto) {
    return this.peopleService.create(electionId, dto);
  }

  @Patch(':personId')
  @Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
  async update(@Param('electionId') electionId: string, @Param('personId') personId: string, @Body() dto: UpdatePersonDto) {
    return this.peopleService.update(electionId, personId, dto);
  }

  @Delete(':personId')
  @Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
  async remove(@Param('electionId') electionId: string, @Param('personId') personId: string) {
    return this.peopleService.remove(electionId, personId);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(@Param('electionId') electionId: string, @UploadedFile() file: { buffer: Buffer }) {
    return this.peopleService.preview(electionId, file);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('electionId') electionId: string, @UploadedFile() file: { buffer: Buffer }) {
    return this.peopleService.upload(electionId, file);
  }
}
