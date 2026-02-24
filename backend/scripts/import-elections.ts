import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { importRawElections } from '../src/elections/import-elections.util';

const prisma = new PrismaClient();

async function main() {
  const rawRoot = process.env.RAW_DATA_ROOT || path.resolve(__dirname, '../data');
  await importRawElections((prisma as any), rawRoot);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
