import * as assert from 'node:assert/strict';
import * as path from 'path';
import { findRawElectionDates, importRawElections } from '../src/elections/import-elections.util';

type AsyncTest = () => Promise<void>;

async function run(name: string, test: AsyncTest): Promise<void> {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  const rawRoot = path.resolve(__dirname, '../data');

  await run('findRawElectionDates detects election directories', async () => {
    const dates = findRawElectionDates(rawRoot);
    assert.equal(dates.length > 0, true);
    assert.equal(/^\d{4}\.\d{2}\.\d{2}$/.test(dates[0]), true);
  });

  await run('importRawElections imports rows and skips already imported dates', async () => {
    const existingDates = new Set<string>();
    const created: Array<{ date: string; name: string }> = [];
    const parties: Array<{ electionId: string; partyId: string; name: string }> = [];
    const regions: Array<{ electionId: string; regionId: string; name: string }> = [];
    const sections: Array<Record<string, any>> = [];

    const client = {
      election: {
        findUnique: async ({ where: { date } }: { where: { date: string } }) => {
          return existingDates.has(date) ? { date } : null;
        },
        create: async ({ data }: { data: { date: string; name: string } }) => {
          created.push({ date: data.date, name: data.name });
          existingDates.add(data.date);
          return { ...data, id: data.date };
        },
      },
      electionParty: {
        createMany: async ({ data }: { data: Array<{ electionId: string; partyId: string; name: string }> }) => {
          parties.push(...data);
          return { count: data.length };
        },
      },
      electionRegion: {
        createMany: async ({ data }: { data: Array<{ electionId: string; regionId: string; name: string }> }) => {
          regions.push(...data);
          return { count: data.length };
        },
      },
      electionSection: {
        createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
          sections.push(...data);
          return { count: data.length };
        },
      },
    };

    await importRawElections(client as any, rawRoot, () => undefined);
    assert.equal(created.length > 0, true);
    assert.equal(parties.length > 0, true);
    assert.equal(regions.length > 0, true);
    assert.equal(sections.length > 0, true);

    const importedCount = created.length;
    await importRawElections(client as any, rawRoot, () => undefined);
    assert.equal(created.length, importedCount);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
