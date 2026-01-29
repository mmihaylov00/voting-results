import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, BehaviorSubject, from, forkJoin } from 'rxjs';
import { Section, SectionDetails, Region } from '../models/election.models';
import elections from '../../assets/elections.json';
import * as pako from 'pako';

@Injectable({
  providedIn: 'root'
})
export class ElectionService {
  private baseDataUrl = '/data';
  private electionDates = elections;
  private cache: { [date: string]: { sections: Section[], parties: { [id: string]: string }, regions: Region[] } } = {};
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private allDataLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(private http: HttpClient) { }

  private ensureDataLoaded(): Observable<void> {
    if (this.allDataLoaded) return of(undefined);
    if (this.loadPromise) return from(this.loadPromise);

    this.loadingSubject.next(true);
    const dates = this.electionDates.map((d) => d.date);

    this.loadPromise = new Promise<void>((resolve, reject) => {
      forkJoin(
        dates.map((d) =>
          this.http
            .get(`${this.baseDataUrl}/compiled/${d}.json.gz`, { responseType: 'arraybuffer' })
            .pipe(
              map((data: ArrayBuffer) => {
                try {
                  const uint8 = new Uint8Array(data);
                  let decompressed: Uint8Array;

                  // Check for gzip magic numbers: 0x1f 0x8b
                  if (uint8.length > 2 && uint8[0] === 0x1f && uint8[1] === 0x8b) {
                    decompressed = pako.ungzip(uint8);
                  } else {
                    // Data is not gzipped or already decompressed by the browser (Content-Encoding: gzip)
                    decompressed = uint8;
                  }

                  const jsonString = new TextDecoder().decode(decompressed);
                  return JSON.parse(jsonString);
                } catch (e) {
                  const uint8 = new Uint8Array(data);
                  const firstBytes = Array.from(uint8.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                  console.error(`Error decompressing/parsing data for ${d}. First bytes: ${firstBytes}`, e);
                  throw e;
                }
              })
            )
        )
      ).subscribe({
        next: (allData: any[]) => {
          dates.forEach((d, i) => {
            this.cache[d] = allData[i];
          });

          this.allDataLoaded = true;
          this.loadingSubject.next(false);
          resolve();
        },
        error: (err: any) => {
          console.error('Error loading election data:', err);
          this.loadingSubject.next(false);
          this.loadPromise = null;
          reject(err);
        },
      });
    });

    return from(this.loadPromise);
  }

  getDates() {
    return this.electionDates;
  }

  getAllData(): Observable<{ [date: string]: { sections: Section[], parties: { [id: string]: string }, regions: Region[] } }> {
    return this.ensureDataLoaded().pipe(map(() => this.cache));
  }

  getRegions(date: string): Observable<Region[]> {
    return this.ensureDataLoaded().pipe(map(() => this.cache[date]?.regions || []));
  }

  getSections(date: string, regionId?: string): Observable<Section[]> {
    // If loading all sections, use regions to determine which sections to include
    // This avoids loading the full global file upfront
    if (!regionId || regionId === 'all') {
      // Load regions first (lightweight), then get their sections
      return this.getRegions(date).pipe(
        map((regions) => {
          // Now ensure sections are loaded
          // The cache will be populated by ensureDataLoaded when regions are loaded
          const cachedSections = this.cache[date]?.sections || [];
          
          // Get region IDs from loaded regions
          const regionIds = new Set(regions.map(r => r.id));
          
          // Filter sections to only include those from the loaded regions
          // This reuses the region data instead of loading a separate global file
          return cachedSections.filter((s) => regionIds.has(s.regionId));
        })
      );
    }
    
    // For specific region, load normally
    return this.ensureDataLoaded().pipe(
      map(() => {
        const sections = this.cache[date]?.sections || [];
        return sections.filter((s) => s.regionId === regionId);
      })
    );
  }

  getParties(date: string): Observable<{ [id: string]: string }> {
    return this.ensureDataLoaded().pipe(map(() => this.cache[date]?.parties || {}));
  }

  getSectionDetails(date: string, sectionId: string): Observable<SectionDetails> {
    return this.ensureDataLoaded().pipe(
      map(() => {
        const sections = this.cache[date]?.sections || [];
        const section = sections.find((s) => s.sectionId === sectionId);
        if (!section) throw new Error('Section not found');

        const partiesMap = this.cache[date].parties;
        const partyResults = Object.entries(section.partyVotes).map(([partyId, votes]) => ({
          partyId,
          partyName: partiesMap[partyId] || partyId,
          total: votes.total,
          paper: votes.paper,
          machine: votes.machine,
          percent: section.voted > 0 ? votes.total / section.voted : 0
        })).sort((a, b) => b.total - a.total);

        if (section.noVotes > 0) {
          partyResults.push({
            partyId: 'no_votes',
            partyName: 'Не подкрепя никого',
            total: section.noVotes,
            paper: section.noVotesPaper || 0,
            machine: section.noVotesMachine || 0,
            percent: section.voted > 0 ? section.noVotes / section.voted : 0
          });
        }

        return {
          sectionId: section.sectionId,
          cityName: section.cityName,
          sectionName: section.sectionName,
          partyResults
        };
      })
    );
  }
}
