import { Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APP_ROLE } from '@votes/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { ResultsService } from './results.service';

@Controller('elections/manage/:electionId/results')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(APP_ROLE.ADMIN)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @Param('electionId') electionId: string,
    @Query('electionDate') electionDate: string,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.resultsService.preview(electionId, electionDate, file);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('electionId') electionId: string,
    @Query('electionDate') electionDate: string,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.resultsService.upload(electionId, electionDate, file);
  }

  @Get()
  @Roles(APP_ROLE.ADMIN)
  async list(
    @Param('electionId') electionId: string,
    @Query('electionDate') electionDate: string,
  ) {
    return this.resultsService.getElectionResults(electionId, electionDate);
  }

  @Get('stats')
  @Roles(APP_ROLE.ADMIN, APP_ROLE.VIEWER)
  async stats(
    @Param('electionId') electionId: string,
    @Query('electionDate') electionDate: string,
  ) {
    return this.resultsService.getStats(electionId, electionDate);
  }
}
