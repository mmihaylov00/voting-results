import { Module } from '@nestjs/common';
import { ElectionsManageController } from './elections-manage.controller';
import { ElectionsManageService } from './elections-manage.service';

@Module({
  controllers: [ElectionsManageController],
  providers: [ElectionsManageService],
})
export class ElectionsManageModule {}
