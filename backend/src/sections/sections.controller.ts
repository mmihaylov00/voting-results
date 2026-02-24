import { Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { SectionsService } from './sections.service';

@Controller('elections/manage/:electionId/sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN)
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  @Roles(APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER)
  async list(@Param('electionId') electionId: string) {
    return this.sectionsService.list(electionId);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(@Param('electionId') electionId: string, @UploadedFile() file: { buffer: Buffer }) {
    return this.sectionsService.preview(electionId, file);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('electionId') electionId: string, @UploadedFile() file: { buffer: Buffer }) {
    return this.sectionsService.upload(electionId, file);
  }
}
