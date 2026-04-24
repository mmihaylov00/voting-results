import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { SettlementGeometryCollection, SettlementLookup } from '../utils/settlement-map.util';

@Injectable({
  providedIn: 'root',
})
export class SettlementMapDataService {
  private settlementGeometry$?: Observable<SettlementGeometryCollection>;
  private settlementsLookup$?: Observable<SettlementLookup[]>;

  constructor(private http: HttpClient) {}

  getSettlementGeometry(): Observable<SettlementGeometryCollection> {
    if (!this.settlementGeometry$) {
      this.settlementGeometry$ = this.http
        .get<SettlementGeometryCollection>('/maps/settlements.extended.json')
        .pipe(shareReplay(1));
    }
    return this.settlementGeometry$;
  }

  getSettlementsLookup(): Observable<SettlementLookup[]> {
    if (!this.settlementsLookup$) {
      this.settlementsLookup$ = this.http
        .get<SettlementLookup[]>('/settlements.json')
        .pipe(shareReplay(1));
    }
    return this.settlementsLookup$;
  }
}
