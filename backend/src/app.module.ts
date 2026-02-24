import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ElectionsManageModule } from './elections-manage/elections-manage.module';
import { SectionsModule } from './sections/sections.module';
import { PeopleModule } from './people/people.module';
import { PositionsModule } from './positions/positions.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { ElectionsModule } from './elections/elections.module';
import { UploadsModule } from './uploads/uploads.module';
import { ImportsModule } from './imports/imports.module';
import { ResultsModule } from './results/results.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ElectionsManageModule,
    SectionsModule,
    PeopleModule,
    PositionsModule,
    AssignmentsModule,
    ElectionsModule,
    UploadsModule,
    ImportsModule,
    ResultsModule,
  ],
})
export class AppModule {}
