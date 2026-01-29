import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, of, tap, BehaviorSubject, from, switchMap } from 'rxjs';
import { Section, SectionDetails, PartyVotes, Region } from '../models/election.models';

@Injectable({
  providedIn: 'root'
})
export class ElectionService {
  private baseDataUrl = '/data';
  private electionDates = [
    {date: '2024.10.27', name: 'Октомври 2024'},
    {date: '2024.06.09', name: 'Юни 2024'},
    {date: '2023.04.02', name: 'Април 2023'},
  ]
  private cache: { [date: string]: { sections: Section[], parties: { [id: string]: string }, regions?: Region[] } } = {};
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private allDataLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(private http: HttpClient) { }

  private ensureDataLoaded(): Observable<void> {
    if (this.allDataLoaded) return of(undefined);
    if (this.loadPromise) return from(this.loadPromise);

    this.loadingSubject.next(true);
    const dates = this.electionDates.map(d => d.date);

    this.loadPromise = new Promise((resolve, reject) => {
      forkJoin(dates.map(d => this.loadElectionDataInternal(d))).subscribe({
        next: (allData) => {
          dates.forEach((d, i) => {
            this.cache[d] = allData[i];
          });

          // Pre-calculate all comparative data once
          dates.forEach(d => {
            this.calculateComparisonsForDate(d);
          });

          this.allDataLoaded = true;
          this.loadingSubject.next(false);
          resolve();
        },
        error: (err) => {
          this.loadingSubject.next(false);
          this.loadPromise = null;
          reject(err);
        }
      });
    });

    return from(this.loadPromise);
  }

  private calculateComparisonsForDate(date: string): void {
    const dates = this.electionDates.map(d => d.date);
    const sectionsByDate: { [date: string]: Section[] } = {};
    dates.forEach(d => sectionsByDate[d] = this.cache[d].sections);

    const targetSections = sectionsByDate[date];
    const regionsMap = new Map<string, {
      name: string,
      partyVotes: { [id: string]: number },
      voted: number,
      total: number,
      discardedVotes: number,
      noVotes: number,
      totalPaper: number,
      totalMachine: number,
      sections: Section[]
    }>();

    targetSections.forEach(s => {
      if (!regionsMap.has(s.regionId)) {
        regionsMap.set(s.regionId, {
          name: (s as any).regionName,
          partyVotes: {},
          voted: 0,
          total: 0,
          discardedVotes: 0,
          noVotes: 0,
          totalPaper: 0,
          totalMachine: 0,
          sections: []
        });
      }
      const reg = regionsMap.get(s.regionId)!;
      reg.sections.push(s);
      reg.voted += s.voted;
      reg.total += s.total;
      reg.discardedVotes += s.discardedVotes;
      reg.noVotes += s.noVotes;
      reg.totalPaper += s.totalPaper || 0;
      reg.totalMachine += s.totalMachine || 0;
      Object.entries(s.partyVotes).forEach(([pid, v]) => {
        reg.partyVotes[pid] = (reg.partyVotes[pid] || 0) + v.total;
      });
    });

    const parties = this.cache[date].parties;

    const regions = Array.from(regionsMap.entries()).map(([id, data]) => {
      const topParties: { name: string, total: number, percent: number, comparisons?: any[] }[] = Object.entries(data.partyVotes)
        .filter(([pid, _]) => pid !== '0')
        .map(([pid, total]) => {
          let name = parties[pid] || pid;
          if (name.includes('ПРОДЪЛЖАВАМЕ')) {
            name = 'ПП-ДБ';
          }
          return {
            name,
            total,
            percent: data.voted > 0 ? total / data.voted : 0,
            comparisons: []
          };
        })
        .filter(p => p.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

      const region = {
        id,
        name: data.name,
        total: data.total,
        voted: data.voted,
        partyVotes: data.partyVotes,
        topParties,
        discardedVotes: data.discardedVotes,
        noVotes: data.noVotes,
        totalPaper: data.totalPaper,
        totalMachine: data.totalMachine,
        comparisons: {}
      } as Region;

      // Add comparisons
      dates.filter(d => d !== date).forEach(d => {
        const otherSections = sectionsByDate[d].filter(s => s.regionId === id);
        const otherVoted = otherSections.reduce((sum, s) => sum + s.voted, 0);
        const otherTotal = otherSections.reduce((sum, s) => sum + s.total, 0);
        const otherDiscarded = otherSections.reduce((sum, s) => sum + s.discardedVotes, 0);
        const otherNoVotes = otherSections.reduce((sum, s) => sum + s.noVotes, 0);
        const otherPaper = otherSections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);
        const otherMachine = otherSections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);
        const dateName = this.electionDates.find(ed => ed.date === d)?.name || d;

        region.comparisons!['voted'] = region.comparisons!['voted'] || [];
        region.comparisons!['voted'].push({ value: otherVoted, date: d, dateName });

        region.comparisons!['total'] = region.comparisons!['total'] || [];
        region.comparisons!['total'].push({ value: otherTotal, date: d, dateName });

        region.comparisons!['discardedVotes'] = region.comparisons!['discardedVotes'] || [];
        region.comparisons!['discardedVotes'].push({ value: otherDiscarded, date: d, dateName });

        region.comparisons!['noVotes'] = region.comparisons!['noVotes'] || [];
        region.comparisons!['noVotes'].push({ value: otherNoVotes, date: d, dateName });

        region.comparisons!['totalPaper'] = region.comparisons!['totalPaper'] || [];
        region.comparisons!['totalPaper'].push({ value: otherPaper, date: d, dateName });

        region.comparisons!['totalMachine'] = region.comparisons!['totalMachine'] || [];
        region.comparisons!['totalMachine'].push({ value: otherMachine, date: d, dateName });

        region.comparisons!['activityPercent'] = region.comparisons!['activityPercent'] || [];
        region.comparisons!['activityPercent'].push({ value: otherTotal > 0 ? otherVoted / otherTotal : 0, date: d, dateName });

        // Party comparisons for regions
        Object.keys(region.partyVotes).forEach(pid => {
          const otherPartyTotal = otherSections.reduce((sum, s) => sum + (s.partyVotes[pid]?.total || 0), 0);
          region.comparisons![`party_${pid}`] = region.comparisons![`party_${pid}`] || [];
          region.comparisons![`party_${pid}`].push({ value: otherPartyTotal, date: d, dateName });
        });

        // Top Parties Comparisons for regions
        (region.topParties as any[])?.forEach(tp => {
          const normalizedTarget = this.normalizePartyName(tp.name);
          const otherPartiesMap = this.cache[d].parties;
          const otherPartyVotes: { [pid: string]: number } = {};
          otherSections.forEach(os => {
            Object.entries(os.partyVotes).forEach(([pid, votes]) => {
              otherPartyVotes[pid] = (otherPartyVotes[pid] || 0) + votes.total;
            });
          });

          let otherTotal = 0;
          Object.entries(otherPartyVotes).forEach(([pid, votes]) => {
            if (this.normalizePartyName(otherPartiesMap[pid] || pid) === normalizedTarget) {
              otherTotal += votes;
            }
          });

          tp.comparisons = tp.comparisons || [];
          tp.comparisons.push({ value: otherTotal, date: d, dateName });
        });
      });

      return region;
    }).sort((a, b) => {
      const idA = parseInt(a.id, 10);
      const idB = parseInt(b.id, 10);
      if (!isNaN(idA) && !isNaN(idB)) {
        return idA - idB;
      }
      return a.id.localeCompare(b.id);
    });

    this.cache[date].regions = regions;

    // Also update targetSections with comparative data
    targetSections.forEach(s => {
      s.comparisons = {};
      dates.filter(d => d !== date).forEach(d => {
        const otherSection = sectionsByDate[d].find(os => os.sectionId === s.sectionId);
        const dateName = this.electionDates.find(ed => ed.date === d)?.name || d;
        if (otherSection) {
          s.comparisons!['voted'] = s.comparisons!['voted'] || [];
          s.comparisons!['voted'].push({ value: otherSection.voted, date: d, dateName });

          s.comparisons!['total'] = s.comparisons!['total'] || [];
          s.comparisons!['total'].push({ value: otherSection.total, date: d, dateName });

          s.comparisons!['discardedVotes'] = s.comparisons!['discardedVotes'] || [];
          s.comparisons!['discardedVotes'].push({ value: otherSection.discardedVotes, date: d, dateName });

          s.comparisons!['noVotes'] = s.comparisons!['noVotes'] || [];
          s.comparisons!['noVotes'].push({ value: otherSection.noVotes, date: d, dateName });

          s.comparisons!['totalPaper'] = s.comparisons!['totalPaper'] || [];
          s.comparisons!['totalPaper'].push({ value: otherSection.totalPaper || 0, date: d, dateName });

          s.comparisons!['totalMachine'] = s.comparisons!['totalMachine'] || [];
          s.comparisons!['totalMachine'].push({ value: otherSection.totalMachine || 0, date: d, dateName });

          s.comparisons!['activityPercent'] = s.comparisons!['activityPercent'] || [];
          s.comparisons!['activityPercent'].push({ value: otherSection.activityPercent, date: d, dateName });

          Object.keys(s.partyVotes).forEach(pid => {
            if (otherSection.partyVotes[pid]) {
              s.partyVotes[pid].comparisons = s.partyVotes[pid].comparisons || [];
              s.partyVotes[pid].comparisons!.push({ value: otherSection.partyVotes[pid].total, date: d, dateName });

              s.partyVotes[pid].percentComparisons = s.partyVotes[pid].percentComparisons || [];
              const otherPercent = otherSection.voted > 0 ? otherSection.partyVotes[pid].total / otherSection.voted : 0;
              s.partyVotes[pid].percentComparisons!.push({ value: otherPercent, date: d, dateName });

              s.partyVotes[pid].paperComparisons = s.partyVotes[pid].paperComparisons || [];
              s.partyVotes[pid].paperComparisons!.push({ value: otherSection.partyVotes[pid].paper, date: d, dateName });

              s.partyVotes[pid].machineComparisons = s.partyVotes[pid].machineComparisons || [];
              s.partyVotes[pid].machineComparisons!.push({ value: otherSection.partyVotes[pid].machine, date: d, dateName });
            }
          });

          // Top Parties Comparisons for sections
          (s.topParties as any[]).forEach(tp => {
            const normalizedTarget = this.normalizePartyName(tp.name);
            const otherPartiesMap = this.cache[d].parties;
            let otherTotal = 0;
            Object.entries(otherSection.partyVotes).forEach(([pid, votes]) => {
              if (this.normalizePartyName(otherPartiesMap[pid] || pid) === normalizedTarget) {
                otherTotal += votes.total;
              }
            });
            tp.comparisons = tp.comparisons || [];
            tp.comparisons.push({ value: otherTotal, date: d, dateName });
          });
        }
      });
    });
  }

  getDates() {
    return this.electionDates;
  }

  getRegions(date: string): Observable<Region[]> {
    return this.ensureDataLoaded().pipe(
      map(() => this.cache[date].regions || [])
    );
  }

  private normalizePartyName(name: string): string {
    const n = name.toUpperCase();
    if (n.includes('ПРОДЪЛЖАВАМЕ')) return 'ПП-ДБ';
    if (n.includes('ГЕРБ')) return 'ГЕРБ-СДС';
    if (n.includes('ВЪЗРАЖДАНЕ')) return 'ВЪЗРАЖДАНЕ';
    if (n.includes('ДПС')) return 'ДПС';
    if (n.includes('БСП')) return 'БСП';
    if (n.includes('ТАКЪВ НАРОД')) return 'ИТН';
    if (n.includes('ВЕЛИЧИЕ')) return 'ВЕЛИЧИЕ';
    if (n.includes('МЕЧ')) return 'МЕЧ';
    return name;
  }

  getSections(date: string, regionId?: string): Observable<Section[]> {
    return this.ensureDataLoaded().pipe(
      map(() => {
        const sections = this.cache[date].sections;
        return regionId ? sections.filter(s => s.regionId === regionId) : sections;
      })
    );
  }

  getParties(date: string): Observable<{ [id: string]: string }> {
    return this.ensureDataLoaded().pipe(
      map(() => this.cache[date].parties)
    );
  }

  getSectionDetails(date: string, sectionId: string): Observable<SectionDetails> {
    return this.getSections(date).pipe(
      map(sections => {
        const section = sections.find(s => s.sectionId === sectionId);
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

        return {
          sectionId: section.sectionId,
          cityName: section.cityName,
          sectionName: section.sectionName,
          partyResults
        };
      })
    );
  }

  private loadElectionDataInternal(date: string): Observable<{ sections: Section[], parties: { [id: string]: string } }> {
    const baseUrl = `${this.baseDataUrl}/${date}`;

    return forkJoin({
      sectionsText: this.http.get(`${baseUrl}/sections.txt`, { responseType: 'text' }),
      protocolsText: this.http.get(`${baseUrl}/protocols.txt`, { responseType: 'text' }),
      votesText: this.http.get(`${baseUrl}/votes.txt`, { responseType: 'text' }),
      partiesText: this.http.get(`${baseUrl}/cik_parties.txt`, { responseType: 'text' })
    }).pipe(
      map(({ sectionsText, protocolsText, votesText, partiesText }) => {
        const parties = this.parseParties(partiesText);
        const sectionsMap = this.parseSections(sectionsText);
        this.applyProtocols(sectionsMap, protocolsText);
        this.applyVotes(sectionsMap, votesText);

        const sections = Object.values(sectionsMap);
        for (const section of sections) {
          section.totalPaper = Object.values(section.partyVotes).reduce((sum, v) => sum + v.paper, 0) + (section.noVotesPaper || 0) + (section.discardedVotes || 0);
          section.totalMachine = Object.values(section.partyVotes).reduce((sum, v) => sum + v.machine, 0) + (section.noVotesMachine || 0);
          section.activityPercent = section.total > 0 ? section.voted / section.total : 0;

          section.topParties = Object.entries(section.partyVotes)
            .filter(([id, _]) => id !== '0')
            .map(([partyId, votes]) => {
              let name = parties[partyId] || partyId;
              if (name.includes('ПРОДЪЛЖАВАМЕ')) {
                name = 'ПП-ДБ';
              }
              return {
                name,
                total: votes.total,
                percent: section.voted > 0 ? votes.total / section.voted : 0,
                comparisons: []
              };
            })
            .filter(p => p.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
        }

        return { sections, parties };
      })
    );
  }

  private parseParties(text: string): { [id: string]: string } {
    const parties: { [id: string]: string } = {};
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(';');
      if (parts.length < 2) continue;
      const partyId = parts[0].trim();
      const partyName = parts[1].trim();
      if (partyId) {
        parties[partyId] = partyName;
      }
    }
    parties['0'] = 'Други';
    return parties;
  }

  private parseSections(text: string): { [id: string]: Section } {
    const sections: { [id: string]: Section } = {};
    const lines = text.split('\n');

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(';');
      if (parts.length <= 5) continue;

      const sectionId = parts[0].trim();
      const regionId = parts[1].trim();
      const regionName = parts[2].trim();

      const cityName = parts[4].trim();
      let sectionName = parts[5].trim().replace(/\s+([,.!? ])/g, '$1');

      if (sectionName.toLowerCase().startsWith('гр.') || sectionName.toLowerCase().startsWith('с.')) {
        sectionName = sectionName.substring(cityName.length + 2);
      }

      if (sectionId) {
        sections[sectionId] = {
          sectionId,
          regionId,
          regionName,
          cityName,
          sectionName,
          total: 0,
          voted: 0,
          discardedVotes: 0,
          noVotes: 0,
          noVotesPaper: 0,
          noVotesMachine: 0,
          partyVotes: {},
          topParties: [],
          activityPercent: 0
        } as any;
      }
    }
    return sections;
  }

  private applyProtocols(sections: { [id: string]: Section }, text: string): void {
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(';');
      if (parts.length <= 9) continue;

      const sectionId = parts[1].trim();
      const section = sections[sectionId];
      if (!section) continue;

      if (parts.length == 21) {
        //2024.06
        section.total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[10]);
        section.voted = this.parseLongSafe(parts[11]);
        section.discardedVotes = this.parseLongSafe(parts[15]);
        section.noVotesPaper = this.parseLongSafe(parts[16]);
        section.noVotesMachine = this.parseLongSafe(parts[19]);
        section.protocolPaperVotes = this.parseLongSafe(parts[14]);
        section.protocolMachineVotes = this.parseLongSafe(parts[18]);
      } else if(parts.length == 25) {
        //2023.04
        section.total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[8]);
        section.voted = this.parseLongSafe(parts[9]);
        section.discardedVotes = this.parseLongSafe(parts[15]);
        section.noVotesPaper = this.parseLongSafe(parts[22]);
        section.noVotesMachine = this.parseLongSafe(parts[23]);
        section.protocolPaperVotes = this.parseLongSafe(parts[12]);
        section.protocolMachineVotes = this.parseLongSafe(parts[13]);
      } else {
        // 2024.10
        section.total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[8]);
        section.voted = this.parseLongSafe(parts[9]);
        section.discardedVotes = this.parseLongSafe(parts[13]);
        section.noVotesPaper = this.parseLongSafe(parts[14]);
        section.noVotesMachine = this.parseLongSafe(parts[17]);
        section.protocolPaperVotes = this.parseLongSafe(parts[12]);
        section.protocolMachineVotes = this.parseLongSafe(parts[16]);
      }
      section.noVotes = (section.noVotesPaper || 0) + (section.noVotesMachine || 0);
      section.protocolErrorDiff = section.voted - (section.protocolPaperVotes || 0) - (section.protocolMachineVotes || 0);
      section.hasProtocolError = section.protocolErrorDiff != 0;
    }
  }

  private applyVotes(sections: { [id: string]: Section }, text: string): void {
    const lines = text.split('\n');

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(';');
      if (parts.length < 4) continue;

      const sectionId = parts[1].trim();

      const section = sections[sectionId];
      if (!section) continue;

      for (let i = 3; i + 3 < parts.length; i += 4) {
        const partyId = parts[i].trim();
        const total = this.parseLongSafe(parts[i + 1]);
        const paper = this.parseLongSafe(parts[i + 2]);
        const machine = this.parseLongSafe(parts[i + 3]);

        if (!section.partyVotes[partyId]) {
          section.partyVotes[partyId] = { total: 0, paper: 0, machine: 0 };
        }
        section.partyVotes[partyId].total += total;
        section.partyVotes[partyId].paper += paper;
        section.partyVotes[partyId].machine += machine;
      }
    }
  }

  private parseLongSafe(s: string): number {
    if (!s) return 0;
    const n = parseInt(s.trim(), 10);
    return isNaN(n) ? 0 : n;
  }
}
