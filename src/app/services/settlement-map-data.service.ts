import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { SettlementGeometryCollection, SettlementLookup } from '../utils/settlement-map.util';

@Injectable({
  providedIn: 'root',
})
export class SettlementMapDataService {
  private settlementGeometry$?: Observable<SettlementGeometryCollection>;
  private regionGeometry$?: Observable<any>;
  private municipalityGeometry$?: Observable<any>;
  private settlementsLookup$?: Observable<SettlementLookup[]>;
  private municipalitiesLookup$?: Observable<any[]>;

  constructor(private http: HttpClient) {}

  getSettlementGeometry(): Observable<SettlementGeometryCollection> {
    if (!this.settlementGeometry$) {
      this.settlementGeometry$ = this.http
        .get<SettlementGeometryCollection>('/maps/settlements.extended.json')
        .pipe(shareReplay(1));
    }
    return this.settlementGeometry$;
  }

  getRegionGeometry(): Observable<any> {
    if (!this.regionGeometry$) {
      this.regionGeometry$ = this.http
        .get<any>('/maps/regions.json')
        .pipe(shareReplay(1));
    }
    return this.regionGeometry$;
  }

  getMunicipalityGeometry(): Observable<any> {
    if (!this.municipalityGeometry$) {
      this.municipalityGeometry$ = this.http
        .get<any>('/maps/municipalities.json')
        .pipe(shareReplay(1));
    }
    return this.municipalityGeometry$;
  }

  getSettlementsLookup(): Observable<SettlementLookup[]> {
    if (!this.settlementsLookup$) {
      this.settlementsLookup$ = this.http
        .get<SettlementLookup[]>('/settlements.json')
        .pipe(shareReplay(1));
    }
    return this.settlementsLookup$;
  }

  getMunicipalitiesLookup(): Observable<any[]> {
    if (!this.municipalitiesLookup$) {
      this.municipalitiesLookup$ = this.http
        .get<any[]>('/municipalities.json')
        .pipe(shareReplay(1));
    }
    return this.municipalitiesLookup$;
  }
}
