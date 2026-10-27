import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ElectionContextService } from './election-context.service';

describe('ElectionContextService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shares pending and completed requests, with separate caches per feature and date', () => {
    const service = TestBed.inject(ElectionContextService);
    const http = TestBed.inject(HttpTestingController);
    const first = vi.fn();
    const second = vi.fn();
    service.getDemographics('2026.04.19').subscribe(first);
    service.getDemographics('2026.04.19').subscribe(second);
    const payload = { date: '2026.04.19', parties: [], rows: [] };
    http.expectOne('/data/context/demographics/2026.04.19.json').flush(payload);
    service.getDemographics('2026.04.19').subscribe(first);
    http.expectNone('/data/context/demographics/2026.04.19.json');
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledWith(payload);
    service.getPolls('2026.04.19').subscribe();
    http.expectOne('/data/context/polls/2026.04.19.json').flush({ agencies: [] });
    service.getVoteFlows('2026.04.19').subscribe(first);
    service.getVoteFlows('2026.04.19').subscribe(second);
    http.expectOne('/data/context/flows/2026.04.19.json').flush({ flows: [] });
    service.getVoteFlows('2026.04.19').subscribe();
    http.expectNone('/data/context/flows/2026.04.19.json');
    service.getDemographics('2024.10.27').subscribe();
    http.expectOne('/data/context/demographics/2024.10.27.json').flush({ parties: [], rows: [] });
  });

  it('rejects malformed date paths without making network requests', () => {
    const service = TestBed.inject(ElectionContextService);
    const error = vi.fn();
    service.getPolls('../private').subscribe({ error });
    service.getDemographics('2026/04/19').subscribe({ error });
    service.getVoteFlows('../private').subscribe({ error });
    expect(error).toHaveBeenCalledTimes(3);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
