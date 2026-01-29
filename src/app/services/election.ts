import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, of, tap, BehaviorSubject } from 'rxjs';
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
  private cache: { [date: string]: { sections: Section[], parties: { [id: string]: string } } } = {};
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(private http: HttpClient) { }

  getDates() {
    return this.electionDates;
  }

  getRegions(date: string): Observable<Region[]> {
    return this.getSections(date).pipe(
      map(sections => {
        const regionsMap = new Map<string, {
          name: string,
          partyVotes: {[id: string]: number},
          voted: number,
          total: number,
          discardedVotes: number,
          noVotes: number,
          totalPaper: number,
          totalMachine: number
        }>();

        sections.forEach(s => {
          if (!regionsMap.has(s.regionId)) {
            regionsMap.set(s.regionId, {
              name: (s as any).regionName,
              partyVotes: {},
              voted: 0,
              total: 0,
              discardedVotes: 0,
              noVotes: 0,
              totalPaper: 0,
              totalMachine: 0
            });
          }
          const reg = regionsMap.get(s.regionId)!;
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

        return Array.from(regionsMap.entries()).map(([id, data]) => {
          const topParties = Object.entries(data.partyVotes)
            .filter(([pid, _]) => pid !== '0')
            .map(([pid, total]) => {
              let name = parties[pid] || pid;
              if (name.includes('ПРОДЪЛЖАВАМЕ')) {
                name = 'ПП-ДБ';
              }
              return {
                name,
                total,
                percent: data.voted > 0 ? total / data.voted : 0
              };
            })
            .filter(p => p.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);

          return {
            id,
            name: data.name,
            total: data.total,
            voted: data.voted,
            partyVotes: data.partyVotes,
            topParties,
            discardedVotes: data.discardedVotes,
            noVotes: data.noVotes,
            totalPaper: data.totalPaper,
            totalMachine: data.totalMachine
          } as Region;
        }).sort((a, b) => {
          const idA = parseInt(a.id, 10);
          const idB = parseInt(b.id, 10);
          if (!isNaN(idA) && !isNaN(idB)) {
            return idA - idB;
          }
          return a.id.localeCompare(b.id);
        });
      })
    );
  }

  getSections(date: string, regionId?: string): Observable<Section[]> {
    if (this.cache[date]) {
      const sections = this.cache[date].sections;
      return of(regionId ? sections.filter(s => s.regionId === regionId) : sections);
    }
    return this.loadElectionData(date).pipe(
      map(data => regionId ? data.sections.filter(s => s.regionId === regionId) : data.sections)
    );
  }

  getParties(date: string): Observable<{ [id: string]: string }> {
    if (this.cache[date]) {
      return of(this.cache[date].parties);
    }
    return this.loadElectionData(date).pipe(
      map(data => data.parties)
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

  private loadElectionData(date: string): Observable<{ sections: Section[], parties: { [id: string]: string } }> {
    const baseUrl = `${this.baseDataUrl}/${date}`;
    this.loadingSubject.next(true);

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
          section.totalPaper = Object.values(section.partyVotes).reduce((sum, v) => sum + v.paper, 0) + (section.noVotesPaper || 0);
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
                percent: section.voted > 0 ? votes.total / section.voted : 0
              };
            })
            .filter(p => p.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
        }

        this.cache[date] = { sections, parties };
        return { sections, parties };
      }),
      tap({
        next: () => this.loadingSubject.next(false),
        error: () => this.loadingSubject.next(false),
        complete: () => this.loadingSubject.next(false)
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

      const formType = parts[0].trim();
      const sectionId = parts[1].trim();
      const section = sections[sectionId];
      if (!section) continue;

      let total = 0;
      let voted = 0;
      let discarded = 0;
      let noVote = 0;
      let noVotePaper = 0;
      let noVoteMachine = 0;

      if (parts.length == 21) {
        total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[10]);
        voted = this.parseLongSafe(parts[11]);
        discarded = this.parseLongSafe(parts[15]);
        noVotePaper = this.parseLongSafe(parts[16]);
        noVoteMachine = this.parseLongSafe(parts[19]);
      } else if(parts.length == 25) {
        total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[8]);
        voted = this.parseLongSafe(parts[9]);
        discarded = this.parseLongSafe(parts[15]);
        noVotePaper = this.parseLongSafe(parts[22]);
        noVoteMachine = this.parseLongSafe(parts[23]);
      } else {
        total = this.parseLongSafe(parts[7]) + this.parseLongSafe(parts[8]);
        voted = this.parseLongSafe(parts[9]);
        discarded = this.parseLongSafe(parts[13]);
        noVotePaper = this.parseLongSafe(parts[14]);
        noVoteMachine = this.parseLongSafe(parts[17]);
      }
      noVote = noVotePaper + noVoteMachine;


      section.total += total;
      section.voted += voted;
      section.discardedVotes += discarded;
      section.noVotes += noVote;
      section.noVotesPaper! += noVotePaper;
      section.noVotesMachine! += noVoteMachine;
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
