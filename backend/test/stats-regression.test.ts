import * as assert from 'node:assert/strict';
import * as path from 'path';
import { ElectionsService } from '../src/elections/elections.service';
import { importRawElections } from '../src/elections/import-elections.util';

type AsyncTest = () => Promise<void>;

type ElectionRecord = {
  id: string;
  date: string;
  name: string;
};

class InMemoryElectionClient {
  private readonly elections = new Map<string, ElectionRecord>();
  private readonly electionById = new Map<string, ElectionRecord>();
  private readonly electionParties: Array<{ electionId: string; partyId: string; name: string }> = [];
  private readonly electionRegions: Array<{ electionId: string; regionId: string; name: string; data?: any }> = [];
  private readonly electionSections: Array<Record<string, any>> = [];

  public election = {
    findUnique: async ({ where }: { where: { date?: string; id?: string } }) => {
      if (where.date) return this.elections.get(where.date) ?? null;
      if (where.id) return this.electionById.get(where.id) ?? null;
      return null;
    },
    findMany: async ({ orderBy, select }: { orderBy?: { date: 'asc' | 'desc' }; select?: any } = {}) => {
      let list = Array.from(this.elections.values());
      if (orderBy?.date === 'desc') list = list.sort((a, b) => b.date.localeCompare(a.date));
      else list = list.sort((a, b) => a.date.localeCompare(b.date));
      if (!select) return list;
      return list.map((item) => {
        const out: Record<string, any> = {};
        for (const key of Object.keys(select)) out[key] = (item as any)[key];
        return out;
      });
    },
    create: async ({ data }: { data: { date: string; name: string } }) => {
      const record = { id: data.date, date: data.date, name: data.name };
      this.elections.set(data.date, record);
      this.electionById.set(record.id, record);
      return record;
    },
  };

  public electionParty = {
    createMany: async ({ data }: { data: Array<{ electionId: string; partyId: string; name: string }> }) => {
      this.electionParties.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { electionId: string } }) =>
      this.electionParties.filter((row) => row.electionId === where.electionId),
  };

  public electionRegion = {
    createMany: async ({ data }: { data: Array<{ electionId: string; regionId: string; name: string; data?: any }> }) => {
      this.electionRegions.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { electionId: string } }) =>
      this.electionRegions.filter((row) => row.electionId === where.electionId),
  };

  public electionSection = {
    createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
      this.electionSections.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { electionId: string } }) =>
      this.electionSections
        .filter((row) => row.electionId === where.electionId)
        .sort((a, b) => String(a.sectionId).localeCompare(String(b.sectionId))),
  };
}

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
  const client = new InMemoryElectionClient();
  await importRawElections(client as any, rawRoot, () => undefined);
  const service = new ElectionsService(client as any);

  const list = await service.list();
  const sampleDate = list[0]?.date;
  if (!sampleDate) {
    throw new Error('No elections imported for stats regression test.');
  }

  await run('elections list is returned from imported raw data', async () => {
    assert.equal(list.length > 0, true);
  });

  await run('summary payload includes regions and parties', async () => {
    const summary = await service.getSummary(sampleDate);
    assert.equal(Array.isArray(summary.regions), true);
    assert.equal(typeof summary.parties, 'object');
  });

  await run('full payload includes columnar sections', async () => {
    const full = await service.getFull(sampleDate);
    assert.equal(typeof full.sections, 'object');
    assert.equal(Array.isArray(full.sections.sectionId), true);
    assert.equal(typeof full.sections.count, 'number');
  });

  await run('section detail resolves by section id', async () => {
    const full = await service.getFull(sampleDate);
    const sectionId = full.sections.sectionId[0];
    const detail = await service.getSectionDetail(sampleDate, sectionId);
    assert.equal(String(detail.sectionId), String(sectionId));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
