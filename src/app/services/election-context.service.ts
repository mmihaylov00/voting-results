import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay, throwError } from 'rxjs';
import { DemographicData, PollingData, VoteFlowData } from '../models/election-context.models';

@Injectable({ providedIn: 'root' })
export class ElectionContextService {
  private readonly http = inject(HttpClient);
  private readonly demographics = new Map<string, Observable<DemographicData>>();
  private readonly polls = new Map<string, Observable<PollingData>>();
  private readonly flows = new Map<string, Observable<VoteFlowData>>();

  getDemographics(date: string): Observable<DemographicData> {
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return throwError(() => new Error('Invalid election date'));
    let request = this.demographics.get(date);
    if (!request) {
      request = this.http.get<DemographicData>(`/data/context/demographics/${date}.json`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.demographics.set(date, request);
    }
    return request;
  }

  getPolls(date: string): Observable<PollingData> {
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return throwError(() => new Error('Invalid election date'));
    let request = this.polls.get(date);
    if (!request) {
      request = this.http.get<PollingData>(`/data/context/polls/${date}.json`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.polls.set(date, request);
    }
    return request;
  }

  getVoteFlows(date: string): Observable<VoteFlowData> {
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return throwError(() => new Error('Invalid election date'));
    let request = this.flows.get(date);
    if (!request) {
      request = this.http.get<VoteFlowData>(`/data/context/flows/${date}.json`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.flows.set(date, request);
    }
    return request;
  }
}
