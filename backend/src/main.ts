import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

process.stdout.write('[BOOT] main.ts reached\n');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  app.enableCors({ origin: 'http://localhost:4200' });
  app.setGlobalPrefix('api');
  logger.log(`Backend listening on http://localhost:${port}/api`);
  await app.listen(port);
 }

bootstrap();
