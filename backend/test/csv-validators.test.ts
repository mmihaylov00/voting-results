import * as assert from 'node:assert/strict';
import { PeopleService } from '../src/people/people.service';
import { SectionsService } from '../src/sections/sections.service';
import { CampaignCsvBaseService } from '../src/common/csv/campaign-csv-base.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

class TestCsvService extends CampaignCsvBaseService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  parse(text: string, requiredHeaders: string[]) {
    return this.parseCsvRows<{ id: string }>(text, {
      requiredHeaders,
      parseRow: ({ get }) => ({ row: { id: get(requiredHeaders[0]) } }),
    });
  }
}

function mockPrismaWithCampaign(exists = true): PrismaService {
  return {
    campaign: {
      findUnique: async () => (exists ? { id: 'c1' } : null),
    },
  } as unknown as PrismaService;
}

function fileOf(text: string): { buffer: Buffer } {
  return { buffer: Buffer.from(text, 'utf-8') };
}

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
  await run('base parser rejects missing required header', async () => {
    const svc = new TestCsvService(mockPrismaWithCampaign());
    const parsed = svc.parse('name;value\nabc;1', ['sectionid']);
    assert.equal(parsed.rows.length, 0);
    assert.equal(parsed.errors.length, 1);
    assert.match(parsed.errors[0].message, /Missing required headers/);
  });

  await run('sections preview validates required fields and duplicate section IDs', async () => {
    const svc = new SectionsService(mockPrismaWithCampaign());
    const text = [
      'sectionId;regionId;regionName;cityName;sectionName',
      '100;1;Region A;City;Section A',
      '100;1;Region A;City;Section Duplicate',
      ';1;Region A;City;Section Missing Id',
    ].join('\n');

    const preview = await svc.preview('c1', fileOf(text));
    assert.equal(preview.total, 3);
    assert.equal(preview.valid, 1);
    assert.equal(preview.invalid, 2);
  });

  await run('sections preview succeeds on valid CSV', async () => {
    const svc = new SectionsService(mockPrismaWithCampaign());
    const text = [
      'sectionId;regionId;regionName;cityName;sectionName;municipalityId;sectionType',
      '101;1;Region A;City;Section 1;5001;City',
      '102;1;Region A;City;Section 2;5001;City',
    ].join('\n');

    const preview = await svc.preview('c1', fileOf(text));
    assert.equal(preview.total, 2);
    assert.equal(preview.valid, 2);
    assert.equal(preview.invalid, 0);
    assert.equal(preview.samples[0].sectionId, '101');
  });

  await run('people preview validates fullname and optional columns', async () => {
    const svc = new PeopleService(mockPrismaWithCampaign());
    const text = [
      'fullName;email;phone;externalId',
      'John Doe;john@example.com;111;crm-1',
      ';invalid@example.com;222;crm-2',
    ].join('\n');

    const preview = await svc.preview('c1', fileOf(text));
    assert.equal(preview.total, 2);
    assert.equal(preview.valid, 1);
    assert.equal(preview.invalid, 1);
    assert.equal(preview.samples[0].fullName, 'John Doe');
  });

  await run('preview fails when campaign does not exist', async () => {
    const svc = new PeopleService(mockPrismaWithCampaign(false));
    const text = 'fullName\nJohn Doe';

    let threw = false;
    try {
      await svc.preview('missing', fileOf(text));
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
