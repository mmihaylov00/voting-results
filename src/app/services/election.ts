import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, BehaviorSubject, from, forkJoin, catchError } from 'rxjs';
import { Section, SectionDetails, Region } from '../models/election.models';
import elections from '../../assets/elections.json';
import * as pako from 'pako';
import compactMapping from '../../assets/compact-mapping.json';

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

  private expandPartyVotesMap(partyVotes: any): any {
    if (!partyVotes) return partyVotes;
    const out: { [key: string]: any } = Object.create(null);
    for (const pid of Object.keys(partyVotes)) {
      const pv = partyVotes[pid];
      if (pv && pv.total !== undefined) {
        out[pid] = pv;
        continue;
      }
      const expanded = {...pv};
      if (pv && pv[compactMapping.partyVotes.total] !== undefined) {
        expanded.total = pv[compactMapping.partyVotes.total];
        expanded.paper = pv[compactMapping.partyVotes.paper];
        expanded.machine = pv[compactMapping.partyVotes.machine];
        delete expanded[compactMapping.partyVotes.total];
        delete expanded[compactMapping.partyVotes.paper];
        delete expanded[compactMapping.partyVotes.machine];
      }
      out[pid] = expanded;
    }
    return out;
  }

  private expandCandidateVotesMap(candidateVotes: any): any {
    if (!candidateVotes) return candidateVotes;
    const out: { [key: string]: any } = Object.create(null);
    for (const key of Object.keys(candidateVotes)) {
      const cv = candidateVotes[key];
      if (cv && cv.total !== undefined) {
        out[key] = cv;
        continue;
      }
      const expanded = {...cv};
      if (cv && cv[compactMapping.candidateVotes.total] !== undefined) {
        expanded.total = cv[compactMapping.candidateVotes.total];
        expanded.paper = cv[compactMapping.candidateVotes.paper];
        expanded.machine = cv[compactMapping.candidateVotes.machine];
        delete expanded[compactMapping.candidateVotes.total];
        delete expanded[compactMapping.candidateVotes.paper];
        delete expanded[compactMapping.candidateVotes.machine];
      }
      out[key] = expanded;
    }
    return out;
  }

  private expandTopParties(topParties: any[]): any[] {
    if (!topParties) return topParties;
    return topParties.map(tp => {
      if (tp.percentBp !== undefined) return tp;
      if (tp[compactMapping.topParties.percentBp] === undefined) return tp;
      const expanded = {...tp};
      expanded.percentBp = tp[compactMapping.topParties.percentBp];
      delete expanded[compactMapping.topParties.percentBp];
      return expanded;
    });
  }

  private expandSection(section: any): any {
    if (!section || section.total !== undefined) return section;
    const expanded = {...section};
    expanded.total = section[compactMapping.section.total];
    expanded.voted = section[compactMapping.section.voted];
    expanded.discardedVotes = section[compactMapping.section.discardedVotes];
    expanded.noVotes = section[compactMapping.section.noVotes];
    if (section[compactMapping.section.noVotesPaper] !== undefined) {
      expanded.noVotesPaper = section[compactMapping.section.noVotesPaper];
    }
    if (section[compactMapping.section.noVotesMachine] !== undefined) {
      expanded.noVotesMachine = section[compactMapping.section.noVotesMachine];
    }
    if (section[compactMapping.section.totalPaper] !== undefined) {
      expanded.totalPaper = section[compactMapping.section.totalPaper];
    }
    if (section[compactMapping.section.totalMachine] !== undefined) {
      expanded.totalMachine = section[compactMapping.section.totalMachine];
    }
    expanded.activityBp = section[compactMapping.section.activityBp];
    delete expanded[compactMapping.section.total];
    delete expanded[compactMapping.section.voted];
    delete expanded[compactMapping.section.discardedVotes];
    delete expanded[compactMapping.section.noVotes];
    delete expanded[compactMapping.section.noVotesPaper];
    delete expanded[compactMapping.section.noVotesMachine];
    delete expanded[compactMapping.section.totalPaper];
    delete expanded[compactMapping.section.totalMachine];
    delete expanded[compactMapping.section.activityBp];

    expanded.partyVotes = this.expandPartyVotesMap(section.partyVotes);
    if (section.candidateVotes) {
      expanded.candidateVotes = this.expandCandidateVotesMap(section.candidateVotes);
    }
    expanded.topParties = this.expandTopParties(section.topParties);
    return expanded;
  }

  private expandRegion(region: any): any {
    if (!region || region.total !== undefined) return region;
    const expanded = {...region};
    expanded.total = region[compactMapping.region.total];
    expanded.voted = region[compactMapping.region.voted];
    if (region[compactMapping.region.discardedVotes] !== undefined) {
      expanded.discardedVotes = region[compactMapping.region.discardedVotes];
    }
    if (region[compactMapping.region.noVotes] !== undefined) {
      expanded.noVotes = region[compactMapping.region.noVotes];
    }
    if (region[compactMapping.region.totalPaper] !== undefined) {
      expanded.totalPaper = region[compactMapping.region.totalPaper];
    }
    if (region[compactMapping.region.totalMachine] !== undefined) {
      expanded.totalMachine = region[compactMapping.region.totalMachine];
    }
    if (region[compactMapping.region.avgTurnoutBp] !== undefined) {
      expanded.avgTurnoutBp = region[compactMapping.region.avgTurnoutBp];
    }
    if (region[compactMapping.region.partyPercentsBp] !== undefined) {
      expanded.partyPercentsBp = region[compactMapping.region.partyPercentsBp];
    }
    delete expanded[compactMapping.region.total];
    delete expanded[compactMapping.region.voted];
    delete expanded[compactMapping.region.discardedVotes];
    delete expanded[compactMapping.region.noVotes];
    delete expanded[compactMapping.region.totalPaper];
    delete expanded[compactMapping.region.totalMachine];
    delete expanded[compactMapping.region.avgTurnoutBp];
    delete expanded[compactMapping.region.partyPercentsBp];

    expanded.topParties = this.expandTopParties(region.topParties);
    return expanded;
  }

  private expandData(data: any): any {
    if (!data) return data;
    if (data.sections && data.sections.length > 0 && data.sections[0].total !== undefined) {
      return data;
    }
    return {
      ...data,
      sections: data.sections ? data.sections.map((s: any) => this.expandSection(s)) : data.sections,
      regions: data.regions ? data.regions.map((r: any) => this.expandRegion(r)) : data.regions
    };
  }

  private ensureDataLoaded(): Observable<void> {
    if (this.allDataLoaded) return of(undefined);
    if (this.loadPromise) return from(this.loadPromise);

    this.loadingSubject.next(true);
    const dates = this.electionDates.map((d) => d.date);

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const fetchAndParse = (url: string) => {
        return this.http.get(url, { responseType: 'arraybuffer' }).pipe(
          map((data: ArrayBuffer) => {
            const uint8 = new Uint8Array(data);
            const firstNonWhitespace = (() => {
              for (let i = 0; i < uint8.length && i < 64; i++) {
                const c = uint8[i];
                if (c !== 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) return c;
              }
              return null;
            })();
            if (firstNonWhitespace === 0x3c) {
              throw new Error(`HTML response from ${url}`);
            }
            try {
              let decompressed: Uint8Array;

              // Check for gzip magic numbers: 0x1f 0x8b
              if (uint8.length > 2 && uint8[0] === 0x1f && uint8[1] === 0x8b) {
                decompressed = pako.ungzip(uint8);
              } else {
                // Data is not gzipped or already decompressed by the browser (Content-Encoding: gzip/br)
                decompressed = uint8;
              }

              const jsonString = new TextDecoder().decode(decompressed);
              return this.expandData(JSON.parse(jsonString));
            } catch (e) {
              const firstBytes = Array.from(uint8.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
              console.error(`Error decompressing/parsing data from ${url}. First bytes: ${firstBytes}`, e);
              throw e;
            }
          })
        );
      };

      forkJoin(
        dates.map((d) =>
          fetchAndParse(`${this.baseDataUrl}/compiled/${d}.json.br`).pipe(
            catchError(() => fetchAndParse(`${this.baseDataUrl}/compiled/${d}.json.gz`))
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
