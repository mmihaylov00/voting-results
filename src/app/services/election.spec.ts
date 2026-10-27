import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { ElectionService } from './election';
import { ELECTION_TYPE } from '../utils/election-type';
import { ElectionDataWorker, ElectionWorkerUnavailableError } from './election-data-worker';

function responseBuffer(value: object): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function compactRiskPayload() {
  return {
    version: 2,
    regions: [{ id: '01', name: 'Район 1', total: 100, voted: 85, partyVotes: { '1': 40, '2': 40, '3': 5 } }],
    parties: { '1': 'Партия 1', '2': 'Партия 2', '3': 'Партия 3' },
    sections: {
      count: 1, sectionId: ['010100001'], regionId: ['01'],
      dicts: { cityName: ['Банско'], sectionName: ['Училище'] },
      cityNameId: [0], sectionNameId: [0], settlementEkatte: ['02676'], sectionType: [0], longitude: [0], latitude: [0],
      total: [100], voted: [85], discardedVotes: [0], noVotes: [0], noVotesPaper: [0], noVotesMachine: [0],
      totalPaper: [85], totalMachine: [0], activityBp: [8500], riskScore: [1], hasProtocolError: [0],
      protocolErrorDiff: [0], protocolPaperVotes: [85], protocolMachineVotes: [0], votesToFirst: [0],
      topPartyOffset: [0, 2], topPartyPartyId: ['1', '2'], topPartyName: ['Партия 1', 'Партия 2'],
      topPartyTotal: [40, 40], topPartyPercentBp: [4706, 4706],
      partyVotesOffset: [0, 3], partyVotesPartyId: ['1', '2', '3'], partyVotesTotal: [40, 40, 5],
      partyVotesPaper: [40, 40, 5], partyVotesMachine: [0, 0, 0],
      riskOffset: [0, 1], riskCode: ['R1.1'], riskCategory: ['R1'], riskSeverity: ['high'], riskDetails: ['{}'],
      // Candidate arrays are deliberately absent: a risk projection must never read them.
      candidateVotesOffset: [0, 1], candidateRiskOffset: [0, 1],
    },
  };
}

function fullPayload(count = 1) {
  const payload = compactRiskPayload();
  return { ...payload, sections: {
    ...payload.sections, count,
    sectionId: Array.from({ length: count }, (_, index) => `0101${String(index + 1).padStart(5, '0')}`),
    regionId: Array.from({ length: count }, () => '01'),
    candidateVotesOffset: Array.from({ length: count + 1 }, (_, index) => index),
    candidateVotesCandidateId: Array.from({ length: count }, () => '101'),
    candidateVotesPartyId: Array.from({ length: count }, () => '1'),
    candidateVotesCandidateName: Array.from({ length: count }, () => 'Кандидат 1'),
    candidateVotesTotal: Array.from({ length: count }, (_, index) => index + 10),
    candidateVotesPaper: Array.from({ length: count }, (_, index) => index + 10),
    candidateVotesMachine: Array.from({ length: count }, () => 0),
    candidateRiskOffset: Array.from({ length: count + 1 }, () => 0),
  } };
}

describe('ElectionService', () => {
  let service: ElectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ElectionService);
  });

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads only presidential summaries in the presidential archive', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [
      provideHttpClient(), provideHttpClientTesting(),
      {provide: ELECTION_TYPE, useValue: 'presidential'},
    ]});
    const presidential = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(presidential.getAllData());
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    for (const election of presidential.getDates()) {
      expect(election.type).toBe('presidential');
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${election.date}.summary.json.gz`));
      request.flush(responseBuffer({version: 2, regions: [], parties: {}}));
    }
    expect(Object.keys(await result)).toEqual(presidential.getDates().map(e => e.date));
    http.verify();
  });

  it('shares full-data requests between simultaneous detail-page subscriptions', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const fullData = firstValueFrom(elections.getAllFullData());
    const sections = firstValueFrom(elections.getSections(elections.getDates()[0].date, undefined, true));
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    const payload = responseBuffer({
      version: 2, regions: [], parties: {}, sections: {count: 0, sectionId: [], regionId: []},
    });
    for (const election of elections.getDates()) {
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${election.date}.full.json.gz`));
      request.flush(payload);
    }
    expect(Object.keys(await fullData)).toHaveLength(elections.getDates().length);
    expect(await sections).toEqual([]);
    http.verify();
  });

  it('loads only the requested summary and shares it between regions and parties', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const date = elections.getDates()[1].date;
    const regions = firstValueFrom(elections.getRegions(date));
    const parties = firstValueFrom(elections.getParties(date));
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.summary.json.gz`));
    request.flush(responseBuffer({version: 2, regions: [], parties: {'1': 'Партия 1'}}));
    expect(await regions).toEqual([]);
    expect(await parties).toEqual({'1': 'Партия 1'});
    expect(await firstValueFrom(elections.getParties(date))).toBe(await parties);
    expect(await firstValueFrom(elections.getRegions('unknown'))).toEqual([]);
    http.verify();
  });

  it('reuses a pending summary when the archive requests every date', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const dates = elections.getDates();
    const regions = firstValueFrom(elections.getRegions(dates[0].date));
    const archive = firstValueFrom(elections.getAllData());
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    for (const election of dates) {
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${election.date}.summary.json.gz`));
      request.flush(responseBuffer({version: 2, regions: [], parties: {}}));
    }
    expect(await regions).toEqual([]);
    expect(Object.keys(await archive)).toEqual(dates.map(election => election.date));
    http.verify();
  });

  it('allows retrying a failed single-date summary request', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const date = elections.getDates()[0].date;
    const failed = firstValueFrom(elections.getParties(date)).catch(error => error);
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    const gzip = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.summary.json.gz`));
    gzip.flush(null, {status: 503, statusText: 'Unavailable'});
    http.expectOne(`/data/compiled/${date}.summary.json.br`).flush(null, {status: 503, statusText: 'Unavailable'});
    expect(await failed).toMatchObject({status: 503});

    const retry = firstValueFrom(elections.getParties(date));
    const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.summary.json.gz`));
    request.flush(responseBuffer({version: 2, regions: [], parties: {'1': 'Партия 1'}}));
    expect(await retry).toEqual({'1': 'Партия 1'});
    http.verify();
  });

  it('loads compact earlier risk history once without populating the full-data cache', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const date = '2021.07.11';
    const first = firstValueFrom(elections.getRiskHistoryData(date));
    const simultaneous = firstValueFrom(elections.getRiskHistoryData(date));
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    const expected = elections.getDates().filter((election) => election.date <= date).map((election) => election.date);
    for (const historicalDate of expected) {
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${historicalDate}.full.json.gz`));
      request.flush(responseBuffer(compactRiskPayload()));
    }
    const history = await first;
    expect(Object.keys(history)).toEqual(expected);
    expect((await simultaneous)[date]).toBe(history[date]);
    const section = history[date].sections[0];
    expect(section.candidateVotes).toBeUndefined();
    expect(section).not.toHaveProperty('candidateRiskIndicators');
    expect(Object.keys(section.partyVotes)).toEqual(['1', '2']);
    expect(section.riskIndicators?.map((indicator) => indicator.code)).toEqual(['R1.1']);
    expect(section.cityName).toBe('Банско');
    expect((await firstValueFrom(elections.getRiskHistoryData(date)))[date]).toBe(history[date]);
    http.verify();

    const fullSections = firstValueFrom(elections.getSections(date));
    const fullRequest = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.full.json.gz`));
    const full = compactRiskPayload();
    fullRequest.flush(responseBuffer({ ...full, sections: {
      ...full.sections,
      candidateVotesCandidateId: ['101'], candidateVotesPartyId: ['1'], candidateVotesCandidateName: ['Кандидат 1'],
      candidateVotesTotal: [10], candidateVotesPaper: [10], candidateVotesMachine: [0],
      candidateRiskCode: ['R6.1'], candidateRiskCategory: ['R6'], candidateRiskSeverity: ['high'], candidateRiskDetails: ['{}'],
    } }));
    const detailed = (await fullSections)[0];
    expect(detailed.candidateVotes?.['1_101'].total).toBe(10);
    expect(Object.keys(detailed.partyVotes)).toEqual(['1', '2', '3']);
    expect((await firstValueFrom(elections.getRiskHistoryData(date)))[date].sections[0]).toBe(section);
    http.verify();
  });

  it('excludes future cycles and other presidential rounds from compact risk history', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [
      provideHttpClient(), provideHttpClientTesting(), {provide: ELECTION_TYPE, useValue: 'presidential'},
    ]});
    const presidential = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const history = firstValueFrom(presidential.getRiskHistoryData('2021.11.21'));
    http.expectOne('/data/compiled/manifest.json').flush({files: {}});
    for (const date of ['2021.11.21', '2016.11.13']) {
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.full.json.gz`));
      request.flush(responseBuffer(compactRiskPayload()));
    }
    expect(Object.keys(await history)).toEqual(['2021.11.21', '2016.11.13']);
    expect(await firstValueFrom(presidential.getRiskHistoryData('unknown'))).toEqual({});
    http.verify();
  });

  it('keeps the complete archive accessible without retaining expanded vote maps for every section', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(elections.getAllFullData());
    const concurrent = firstValueFrom(elections.getAllFullData());
    const date = elections.getDates()[0].date;
    const current = firstValueFrom(elections.getSections(date, undefined, true));
    const riskDetails = '{"candidateId":"101","sectionId":null,"ratio":1.25}';
    const parse = vi.spyOn(JSON, 'parse');
    http.expectOne('/data/compiled/manifest.json').flush({ files: {} });
    for (const election of elections.getDates()) {
      const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${election.date}.full.json.gz`));
      const payload = fullPayload(3);
      request.flush(responseBuffer({ ...payload, sections: { ...payload.sections,
        candidateRiskOffset: [0, 1, 2, 2], candidateRiskCode: ['R6.1', 'R6.2'],
        candidateRiskCategory: ['R6', 'R6'], candidateRiskSeverity: ['high', 'medium'],
        candidateRiskDetails: [riskDetails, '{"candidateId":"102","sectionId":"original"}'],
      } }));
    }
    const archive = await first;
    expect(Object.keys(archive)).toEqual(elections.getDates().map(election => election.date));
    expect((await concurrent)[date]).toBe(archive[date]);
    const [one, two] = archive[date].sections;
    expect(Object.getOwnPropertyDescriptor(one, 'partyVotes')?.get).toBeTypeOf('function');
    expect(one.partyVotes).toEqual({ '1': { total: 40, paper: 40, machine: 0 }, '2': { total: 40, paper: 40, machine: 0 }, '3': { total: 5, paper: 5, machine: 0 } });
    expect(one.partyVotes).not.toBe(one.partyVotes);
    expect(Object.getOwnPropertyDescriptor(one, 'candidateVotes')?.get).toBeTypeOf('function');
    const preferences = one.candidateVotes;
    expect(one.candidateVotes).toBe(preferences);
    expect(two.candidateVotes?.['1_101'].total).toBe(11);
    expect(one.candidateVotes?.['1_101'].total).toBe(10);
    expect(one.candidateVotes).not.toBe(preferences);
    expect(parse.mock.calls.filter(([raw]) => raw === riskDetails)).toHaveLength(0);
    const risks = Reflect.get(one, 'candidateRiskIndicators');
    expect(risks).toEqual([{ code: 'R6.1', category: 'R6', severity: 'high',
      details: { candidateId: '101', sectionId: one.sectionId, ratio: 1.25 } }]);
    expect(Reflect.get(one, 'candidateRiskIndicators')).toBe(risks);
    expect(Reflect.get(two, 'candidateRiskIndicators')[0].details.sectionId).toBe('original');
    expect(Reflect.get(one, 'candidateRiskIndicators')).not.toBe(risks);
    expect(archive[date].sections[2]).not.toHaveProperty('candidateRiskIndicators');
    const compared = (await current)[0];
    expect(Reflect.get(compared, 'candidateRiskIndicators')).toEqual(risks);
    expect(compared.comparisons?.['voted']).toHaveLength(elections.getDates().length - 1);
    expect(compared.comparisons?.['voted'].every(value => value.v === 85)).toBe(true);
    expect(compared.comparisons?.['noVotesPercent'].every(value => value.v === 0)).toBe(true);
    expect(compared.partyVotes['1'].comparisons?.every(value => value.v === 40)).toBe(true);
    expect(compared.partyVotes['1'].percentComparisons?.every(value => value.v === 4706)).toBe(true);
    expect(compared.partyVotes['1'].comparisons).not.toBe(compared.partyVotes['1'].comparisons);
    http.verify();
  });

  it('yields between expansion chunks while returning every section in source order', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    const date = elections.getDates()[0].date;
    const result = firstValueFrom(elections.getSections(date));
    http.expectOne('/data/compiled/manifest.json').flush({ files: {} });
    const request = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.full.json.gz`));
    vi.useFakeTimers();
    const payload = fullPayload(401);
    request.flush(responseBuffer(payload));
    let finished = false;
    void result.then(() => { finished = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(finished).toBe(false);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.runAllTimersAsync();
    expect((await result).map(section => section.sectionId)).toEqual(payload.sections.sectionId);
    expect((await result)[400].candidateVotes?.['1_101'].total).toBe(410);
    http.verify();
  });

  it('downloads a fresh buffer for fallback after a worker failure detaches the original', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const elections = TestBed.inject(ElectionService);
    const http = TestBed.inject(HttpTestingController);
    vi.spyOn(ElectionDataWorker.prototype, 'parse').mockImplementationOnce(buffer => {
      structuredClone(buffer, { transfer: [buffer] });
      return Promise.reject(new ElectionWorkerUnavailableError('worker stopped'));
    });
    const date = elections.getDates()[0].date;
    const result = firstValueFrom(elections.getParties(date));
    http.expectOne('/data/compiled/manifest.json').flush({ files: {} });
    const first = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.summary.json.gz`));
    const original = responseBuffer({ version: 2, parties: { '1': 'Партия 1' }, regions: [] });
    first.flush(original);
    const retry = await vi.waitFor(() => http.expectOne(`/data/compiled/${date}.summary.json.gz`));
    expect(original.byteLength).toBe(0);
    retry.flush(responseBuffer({ version: 2, parties: { '1': 'Партия 1' }, regions: [] }));
    expect(await result).toEqual({ '1': 'Партия 1' });
    http.verify();
  });
});
