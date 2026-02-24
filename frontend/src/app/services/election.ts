import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, BehaviorSubject, from, catchError, firstValueFrom, concat, switchMap } from 'rxjs';
import { Section, SectionDetails, Region } from '../models/election.models';
import { API_BASE_URL } from './api';

export type ElectionDate = { id?: string; date: string; name: string };

type CompactMapping = {
  section: { total: string; voted: string; discardedVotes: string; noVotes: string; noVotesPaper: string; noVotesMachine: string; totalPaper: string; totalMachine: string; activityBp: string };
  region: { total: string; voted: string; discardedVotes: string; noVotes: string; totalPaper: string; totalMachine: string; avgTurnoutBp: string; partyPercentsBp: string };
  partyVotes: { total: string; paper: string; machine: string };
  candidateVotes: { total: string; paper: string; machine: string };
  topParties: { percentBp: string };
};

const DEFAULT_COMPACT_MAPPING: CompactMapping = {
  section: { total: 't', voted: 'v', discardedVotes: 'inv', noVotes: 'nv', noVotesPaper: 'nvp', noVotesMachine: 'nvm', totalPaper: 'tp', totalMachine: 'tm', activityBp: 'ab' },
  region: { total: 't', voted: 'v', discardedVotes: 'inv', noVotes: 'nv', totalPaper: 'tp', totalMachine: 'tm', avgTurnoutBp: 'atb', partyPercentsBp: 'ppb' },
  partyVotes: { total: 't', paper: 'p', machine: 'm' },
  candidateVotes: { total: 't', paper: 'p', machine: 'm' },
  topParties: { percentBp: 'pb' },
};

type SummaryData = {
  regions: Region[];
  parties: { [id: string]: string };
};

type FullData = {
  sections: Section[];
  parties: { [id: string]: string };
  regions: Region[];
};

type ColumnarSections = {
  count: number;
  dicts: {
    cityName: string[];
    sectionName: string[];
  };
  sectionId: string[];
  regionId: string[];
  cityNameId: number[];
  sectionNameId: number[];
  sectionType: number[];
  total: number[];
  voted: number[];
  discardedVotes: number[];
  noVotes: number[];
  noVotesPaper: number[];
  noVotesMachine: number[];
  totalPaper: number[];
  totalMachine: number[];
  activityBp: number[];
  riskScore: number[];
  hasProtocolError: number[];
  protocolErrorDiff: number[];
  protocolPaperVotes: number[];
  protocolMachineVotes: number[];
  votesToFirst: number[];
  topPartyOffset: number[];
  topPartyPartyId: string[];
  topPartyName: string[];
  topPartyTotal: number[];
  topPartyPercentBp: number[];
  partyVotesOffset: number[];
  partyVotesPartyId: string[];
  partyVotesTotal: number[];
  partyVotesPaper: number[];
  partyVotesMachine: number[];
  candidateVotesOffset: number[];
  candidateVotesCandidateId: string[];
  candidateVotesCandidateName: string[];
  candidateVotesPartyId: string[];
  candidateVotesTotal: number[];
  candidateVotesPaper: number[];
  candidateVotesMachine: number[];
  riskOffset: number[];
  riskCode: string[];
  riskCategory: string[];
  riskSeverity: string[];
  riskDetails: string[];
  candidateRiskOffset: number[];
  candidateRiskCode: string[];
  candidateRiskCategory: string[];
  candidateRiskSeverity: string[];
  candidateRiskDetails: string[];
};

type FullDataV2 = {
  sections: ColumnarSections;
  parties: { [id: string]: string };
  regions: Region[];
  sectionIdToIndex: Map<string, number>;
  sectionsByRegion: Map<string, number[]>;
  regionNameById: Map<string, string>;
};

@Injectable({
  providedIn: 'root'
})
export class ElectionService {
  private compactMapping: CompactMapping = DEFAULT_COMPACT_MAPPING;
  private compactMappingFallbackSubject = new BehaviorSubject<boolean>(false);
  public compactMappingFallback$ = this.compactMappingFallbackSubject.asObservable();
  private summaryCache: { [date: string]: SummaryData } = {};
  private fullCache: { [date: string]: FullDataV2 } = {};
  private materializedFullCache: { [date: string]: FullData } = {};
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private datesSubject = new BehaviorSubject<ElectionDate[]>([]);
  public dates$ = this.datesSubject.asObservable();

  private summariesLoaded = false;
  private summaryLoadPromise: Promise<void> | null = null;
  private summaryLoadPromises: { [date: string]: Promise<void> | undefined } = {};
  private fullLoadPromises: { [date: string]: Promise<void> | undefined } = {};

  constructor(private http: HttpClient) {
    this.loadCompactMapping().subscribe();
    this.loadDates().subscribe();
  }

  private loadCompactMapping(): Observable<CompactMapping> {
    return this.http.get<CompactMapping>(`${API_BASE_URL}/elections/compact-mapping`).pipe(
      map((mapping) => {
        this.compactMapping = mapping || DEFAULT_COMPACT_MAPPING;
        this.compactMappingFallbackSubject.next(false);
        return this.compactMapping;
      }),
      catchError(() => {
        this.compactMapping = DEFAULT_COMPACT_MAPPING;
        this.compactMappingFallbackSubject.next(true);
        return of(this.compactMapping);
      })
    );
  }

  private loadDates(): Observable<ElectionDate[]> {
    return this.http.get<ElectionDate[]>(`${API_BASE_URL}/elections`).pipe(
      map((dates) => {
        const normalized = (dates || []).map((d) => ({ id: d.id, date: d.date, name: d.name || d.date }));
        this.datesSubject.next(normalized);
        return normalized;
      }),
      catchError(() => {
        this.datesSubject.next([]);
        return of([]);
      })
    );
  }

  private ensureDatesLoaded(): Observable<void> {
    if (this.datesSubject.value.length > 0) return of(undefined);
    return this.loadDates().pipe(map(() => undefined));
  }

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
      if (pv && pv[this.compactMapping.partyVotes.total] !== undefined) {
        expanded.total = pv[this.compactMapping.partyVotes.total];
        expanded.paper = pv[this.compactMapping.partyVotes.paper];
        expanded.machine = pv[this.compactMapping.partyVotes.machine];
        delete expanded[this.compactMapping.partyVotes.total];
        delete expanded[this.compactMapping.partyVotes.paper];
        delete expanded[this.compactMapping.partyVotes.machine];
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
      if (cv && cv[this.compactMapping.candidateVotes.total] !== undefined) {
        expanded.total = cv[this.compactMapping.candidateVotes.total];
        expanded.paper = cv[this.compactMapping.candidateVotes.paper];
        expanded.machine = cv[this.compactMapping.candidateVotes.machine];
        delete expanded[this.compactMapping.candidateVotes.total];
        delete expanded[this.compactMapping.candidateVotes.paper];
        delete expanded[this.compactMapping.candidateVotes.machine];
      }
      out[key] = expanded;
    }
    return out;
  }

  private expandTopParties(topParties: any[]): any[] {
    if (!topParties) return topParties;
    return topParties.map(tp => {
      if (tp.percentBp !== undefined) return tp;
      if (tp[this.compactMapping.topParties.percentBp] === undefined) return tp;
      const expanded = {...tp};
      expanded.percentBp = tp[this.compactMapping.topParties.percentBp];
      delete expanded[this.compactMapping.topParties.percentBp];
      return expanded;
    });
  }

  private expandSection(section: any): any {
    if (!section || section.total !== undefined) return section;
    const expanded = {...section};
    expanded.total = section[this.compactMapping.section.total];
    expanded.voted = section[this.compactMapping.section.voted];
    expanded.discardedVotes = section[this.compactMapping.section.discardedVotes];
    expanded.noVotes = section[this.compactMapping.section.noVotes];
    if (section[this.compactMapping.section.noVotesPaper] !== undefined) {
      expanded.noVotesPaper = section[this.compactMapping.section.noVotesPaper];
    }
    if (section[this.compactMapping.section.noVotesMachine] !== undefined) {
      expanded.noVotesMachine = section[this.compactMapping.section.noVotesMachine];
    }
    if (section[this.compactMapping.section.totalPaper] !== undefined) {
      expanded.totalPaper = section[this.compactMapping.section.totalPaper];
    }
    if (section[this.compactMapping.section.totalMachine] !== undefined) {
      expanded.totalMachine = section[this.compactMapping.section.totalMachine];
    }
    expanded.activityBp = section[this.compactMapping.section.activityBp];
    delete expanded[this.compactMapping.section.total];
    delete expanded[this.compactMapping.section.voted];
    delete expanded[this.compactMapping.section.discardedVotes];
    delete expanded[this.compactMapping.section.noVotes];
    delete expanded[this.compactMapping.section.noVotesPaper];
    delete expanded[this.compactMapping.section.noVotesMachine];
    delete expanded[this.compactMapping.section.totalPaper];
    delete expanded[this.compactMapping.section.totalMachine];
    delete expanded[this.compactMapping.section.activityBp];

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
    expanded.total = region[this.compactMapping.region.total];
    expanded.voted = region[this.compactMapping.region.voted];
    if (region[this.compactMapping.region.discardedVotes] !== undefined) {
      expanded.discardedVotes = region[this.compactMapping.region.discardedVotes];
    }
    if (region[this.compactMapping.region.noVotes] !== undefined) {
      expanded.noVotes = region[this.compactMapping.region.noVotes];
    }
    if (region[this.compactMapping.region.totalPaper] !== undefined) {
      expanded.totalPaper = region[this.compactMapping.region.totalPaper];
    }
    if (region[this.compactMapping.region.totalMachine] !== undefined) {
      expanded.totalMachine = region[this.compactMapping.region.totalMachine];
    }
    if (region[this.compactMapping.region.avgTurnoutBp] !== undefined) {
      expanded.avgTurnoutBp = region[this.compactMapping.region.avgTurnoutBp];
    }
    if (region[this.compactMapping.region.partyPercentsBp] !== undefined) {
      expanded.partyPercentsBp = region[this.compactMapping.region.partyPercentsBp];
    }
    delete expanded[this.compactMapping.region.total];
    delete expanded[this.compactMapping.region.voted];
    delete expanded[this.compactMapping.region.discardedVotes];
    delete expanded[this.compactMapping.region.noVotes];
    delete expanded[this.compactMapping.region.totalPaper];
    delete expanded[this.compactMapping.region.totalMachine];
    delete expanded[this.compactMapping.region.avgTurnoutBp];
    delete expanded[this.compactMapping.region.partyPercentsBp];

    expanded.topParties = this.expandTopParties(region.topParties);
    return expanded;
  }

  private expandData(data: any, opts?: { includeSections?: boolean }): any {
    if (!data) return data;
    if (data.version === 2) return data;
    if (data.sections && data.sections.length > 0 && data.sections[0].total !== undefined) {
      return data;
    }
    const includeSections = opts?.includeSections ?? true;
    if (!includeSections && data.sections) {
      delete data.sections;
    }
    return {
      ...data,
      sections: includeSections && data.sections ? data.sections.map((s: any) => this.expandSection(s)) : undefined,
      regions: data.regions ? data.regions.map((r: any) => this.expandRegion(r)) : data.regions
    };
  }

  private normalizePayload(data: any, opts?: { includeSections?: boolean }): any {
    if (!data) return data;
    if (data.version === 2) {
      return {
        ...data,
        regions: data.regions ? data.regions.map((r: any) => this.expandRegion(r)) : data.regions
      };
    }
    return this.expandData(data, opts);
  }

  private buildFullData(data: any): FullDataV2 {
    if (!data || data.version !== 2 || !data.sections) {
      throw new Error('Unsupported data format. Expected version 2 payload.');
    }

    const sections = data.sections as ColumnarSections;
    const sectionIdToIndex = new Map<string, number>();
    const sectionsByRegion = new Map<string, number[]>();
    const regionNameById = new Map<string, string>();

    (data.regions || []).forEach((r: Region) => regionNameById.set(r.id, r.name));

    for (let i = 0; i < sections.count; i++) {
      const sectionId = sections.sectionId[i];
      if (sectionId) {
        sectionIdToIndex.set(sectionId, i);
      }
      const regionId = sections.regionId[i];
      if (regionId) {
        let arr = sectionsByRegion.get(regionId);
        if (!arr) {
          arr = [];
          sectionsByRegion.set(regionId, arr);
        }
        arr.push(i);
      }
    }

    return {
      sections,
      parties: data.parties || {},
      regions: data.regions || [],
      sectionIdToIndex,
      sectionsByRegion,
      regionNameById
    };
  }

  private parseRiskDetails(raw: string): any | undefined {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private normalizePartyName(name: string): string {
    const n = (name || '').toUpperCase();
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

  private resolvePartyName(partyId: string, name: string | undefined, parties?: { [id: string]: string }): string {
    const raw = (name || '').trim();
    const looksLikeId = !raw || raw === partyId || /^\d+$/.test(raw);
    const resolved = looksLikeId ? (parties?.[partyId] || raw || partyId) : raw;
    return this.normalizePartyName(resolved);
  }

  private getOtherDates(date: string): string[] {
    return this.datesSubject.value.map((d) => d.date).filter((d) => d !== date);
  }

  private buildOtherSectionPartyTotals(full: FullDataV2, index: number) {
    const s = full.sections;
    const start = s.partyVotesOffset[index] || 0;
    const end = s.partyVotesOffset[index + 1] ?? start;
    const map: { [norm: string]: { total: number; paper: number; machine: number } } = Object.create(null);
    for (let i = start; i < end; i++) {
      const pid = s.partyVotesPartyId[i] || '';
      if (!pid) continue;
      const name = full.parties[pid] || pid;
      const norm = this.normalizePartyName(name);
      const bucket = map[norm] || (map[norm] = { total: 0, paper: 0, machine: 0 });
      bucket.total += s.partyVotesTotal[i] || 0;
      bucket.paper += s.partyVotesPaper[i] || 0;
      bucket.machine += s.partyVotesMachine[i] || 0;
    }
    return map;
  }

  private attachComparisons(date: string, sectionIndex: number, section: Section): void {
    const others = this.getOtherDates(date);
    if (others.length === 0) return;

    const comparisons: { [key: string]: { v: number; d: string }[] } = Object.create(null);
    const partyVoteComparisons: { [pid: string]: { total: { v: number; d: string }[]; paper: { v: number; d: string }[]; machine: { v: number; d: string }[]; percent: { v: number; d: string }[] } } = Object.create(null);

    for (const d of others) {
      const otherFull = this.fullCache[d];
      if (!otherFull) continue;
      const otherIndex = otherFull.sectionIdToIndex.get(section.sectionId);
      if (otherIndex === undefined) continue;

      const os = otherFull.sections;
      const otherVoted = os.voted[otherIndex] || 0;
      const otherTotal = os.total[otherIndex] || 0;
      const otherDiscarded = os.discardedVotes[otherIndex] || 0;
      const otherNoVotes = os.noVotes[otherIndex] || 0;
      const otherNoVotesPaper = os.noVotesPaper[otherIndex] || 0;
      const otherNoVotesMachine = os.noVotesMachine[otherIndex] || 0;
      const otherTotalPaper = os.totalPaper[otherIndex] || 0;
      const otherTotalMachine = os.totalMachine[otherIndex] || 0;
      const otherActivity = os.activityBp[otherIndex] || 0;
      const otherNoVotesPercent = otherVoted > 0 ? Math.round((otherNoVotes / otherVoted) * 10000) : 0;

      (comparisons['total'] ||= []).push({ v: otherTotal, d });
      (comparisons['voted'] ||= []).push({ v: otherVoted, d });
      (comparisons['discardedVotes'] ||= []).push({ v: otherDiscarded, d });
      (comparisons['noVotes'] ||= []).push({ v: otherNoVotes, d });
      (comparisons['totalPaper'] ||= []).push({ v: otherTotalPaper, d });
      (comparisons['totalMachine'] ||= []).push({ v: otherTotalMachine, d });
      (comparisons['activityPercent'] ||= []).push({ v: otherActivity, d });
      (comparisons['noVotesPaper'] ||= []).push({ v: otherNoVotesPaper, d });
      (comparisons['noVotesMachine'] ||= []).push({ v: otherNoVotesMachine, d });
      (comparisons['noVotesPercent'] ||= []).push({ v: otherNoVotesPercent, d });

      const otherPartyTotals = this.buildOtherSectionPartyTotals(otherFull, otherIndex);
      for (const pid of Object.keys(section.partyVotes || {})) {
        const partyName = this.normalizePartyName(this.fullCache[date]?.parties?.[pid] || pid);
        const otherBucket = otherPartyTotals[partyName];
        if (!otherBucket) continue;
        const entry = partyVoteComparisons[pid] || (partyVoteComparisons[pid] = { total: [], paper: [], machine: [], percent: [] });
        entry.total.push({ v: otherBucket.total, d });
        entry.paper.push({ v: otherBucket.paper, d });
        entry.machine.push({ v: otherBucket.machine, d });
        const percent = otherVoted > 0 ? Math.round((otherBucket.total / otherVoted) * 10000) : 0;
        entry.percent.push({ v: percent, d });
      }
    }

    if (Object.keys(comparisons).length > 0) {
      section.comparisons = comparisons;
    }

    for (const pid of Object.keys(partyVoteComparisons)) {
      const entry = partyVoteComparisons[pid];
      const pv = (section.partyVotes as any)[pid];
      if (!pv) continue;
      pv.comparisons = entry.total.length > 0 ? entry.total : undefined;
      pv.paperComparisons = entry.paper.length > 0 ? entry.paper : undefined;
      pv.machineComparisons = entry.machine.length > 0 ? entry.machine : undefined;
      pv.percentComparisons = entry.percent.length > 0 ? entry.percent : undefined;
    }
  }

  private materializeSection(full: FullDataV2, index: number): Section {
    const s = full.sections;
    const regionId = s.regionId[index] || '';
    const cityName = s.dicts.cityName[s.cityNameId[index]] || '';
    const sectionName = s.dicts.sectionName[s.sectionNameId[index]] || '';
    const sectionTypeMap = ['City', 'Village', 'Mobile', 'Other'];

    const section: Section = {
      sectionId: s.sectionId[index] || '',
      regionId,
      regionName: full.regionNameById.get(regionId),
      cityName,
      sectionName,
      sectionType: sectionTypeMap[s.sectionType[index]] || 'Other',
      total: s.total[index] || 0,
      voted: s.voted[index] || 0,
      discardedVotes: s.discardedVotes[index] || 0,
      noVotes: s.noVotes[index] || 0,
      noVotesPaper: s.noVotesPaper[index] || 0,
      noVotesMachine: s.noVotesMachine[index] || 0,
      partyVotes: Object.create(null),
      topParties: [],
      activityBp: s.activityBp[index] || 0,
      totalPaper: s.totalPaper[index] || 0,
      totalMachine: s.totalMachine[index] || 0,
      hasProtocolError: (s.hasProtocolError[index] || 0) === 1,
      protocolErrorDiff: s.protocolErrorDiff[index] || 0,
      protocolPaperVotes: s.protocolPaperVotes[index] || 0,
      protocolMachineVotes: s.protocolMachineVotes[index] || 0,
      riskScore: s.riskScore[index] || 0,
      votesToFirst: s.votesToFirst[index] || 0
    };

    const tpStart = s.topPartyOffset[index] || 0;
    const tpEnd = s.topPartyOffset[index + 1] ?? tpStart;
    for (let i = tpStart; i < tpEnd; i++) {
      const partyId = s.topPartyPartyId[i] || '';
      section.topParties.push({
        partyId,
        name: this.resolvePartyName(partyId, s.topPartyName[i], full.parties),
        total: s.topPartyTotal[i] || 0,
        percentBp: s.topPartyPercentBp[i] || 0
      });
    }

    const pvStart = s.partyVotesOffset[index] || 0;
    const pvEnd = s.partyVotesOffset[index + 1] ?? pvStart;
    for (let i = pvStart; i < pvEnd; i++) {
      const pid = s.partyVotesPartyId[i] || '';
      if (!pid) continue;
      (section.partyVotes as any)[pid] = {
        total: s.partyVotesTotal[i] || 0,
        paper: s.partyVotesPaper[i] || 0,
        machine: s.partyVotesMachine[i] || 0
      };
    }

    const cvStart = s.candidateVotesOffset[index] || 0;
    const cvEnd = s.candidateVotesOffset[index + 1] ?? cvStart;
    if (cvEnd > cvStart) {
      section.candidateVotes = Object.create(null);
      for (let i = cvStart; i < cvEnd; i++) {
        const candidateId = s.candidateVotesCandidateId[i] || '';
        const partyId = s.candidateVotesPartyId[i] || '';
        if (!candidateId || !partyId) continue;
        const key = `${partyId}_${candidateId}`;
        (section.candidateVotes as any)[key] = {
          candidateId,
          candidateName: s.candidateVotesCandidateName[i] || '',
          partyId,
          partyName: full.parties[partyId] || partyId,
          total: s.candidateVotesTotal[i] || 0,
          paper: s.candidateVotesPaper[i] || 0,
          machine: s.candidateVotesMachine[i] || 0
        };
      }
    }

    const riskStart = s.riskOffset[index] || 0;
    const riskEnd = s.riskOffset[index + 1] ?? riskStart;
    if (riskEnd > riskStart) {
      section.riskIndicators = [];
      for (let i = riskStart; i < riskEnd; i++) {
        section.riskIndicators.push({
          code: s.riskCode[i] || '',
          category: s.riskCategory[i] || '',
          severity: s.riskSeverity[i] || '',
          details: this.parseRiskDetails(s.riskDetails[i])
        });
      }
    }

    const crStart = s.candidateRiskOffset[index] || 0;
    const crEnd = s.candidateRiskOffset[index + 1] ?? crStart;
    if (crEnd > crStart) {
      (section as any).candidateRiskIndicators = [];
      for (let i = crStart; i < crEnd; i++) {
        const rawDetails = this.parseRiskDetails(s.candidateRiskDetails[i]);
        const details = (rawDetails && typeof rawDetails === 'object')
          ? { ...rawDetails, sectionId: (rawDetails as any).sectionId ?? section.sectionId }
          : { sectionId: section.sectionId };
        (section as any).candidateRiskIndicators.push({
          code: s.candidateRiskCode[i] || '',
          category: s.candidateRiskCategory[i] || '',
          severity: s.candidateRiskSeverity[i] || '',
          details
        });
      }
    }

    return section;
  }

  private materializeSections(full: FullDataV2, indexes: number[], date?: string, withComparisons?: boolean): Section[] {
    if (withComparisons && date) {
      return indexes.map((i) => {
        const section = this.materializeSection(full, i);
        this.attachComparisons(date, i, section);
        return section;
      });
    }
    return indexes.map((i) => this.materializeSection(full, i));
  }

  private materializeFullData(date: string): FullData {
    const cached = this.materializedFullCache[date];
    if (cached) return cached;
    const full = this.fullCache[date];
    const sections = this.materializeSections(
      full,
      Array.from({ length: full.sections.count }, (_, i) => i)
    );
    const materialized = {
      sections,
      parties: full.parties,
      regions: full.regions
    };
    this.materializedFullCache[date] = materialized;
    return materialized;
  }

  private ensureSummariesLoaded(): Observable<void> {
    if (this.summariesLoaded) return of(undefined);
    if (this.summaryLoadPromise) return from(this.summaryLoadPromise);

    this.summaryLoadPromise = new Promise<void>(async (resolve, reject) => {
      try {
        await firstValueFrom(this.ensureDatesLoaded());
        const dates = this.datesSubject.value.map((d) => d.date);
        const pending = dates.filter((d) => !this.summaryCache[d]);
        await Promise.all(pending.map((d) => firstValueFrom(this.ensureSummaryLoaded(d))));
        this.summariesLoaded = true;
        resolve();
      } catch (err) {
        console.error('Error loading election summaries:', err);
        this.summaryLoadPromise = null;
        reject(err);
      }
    });

    return from(this.summaryLoadPromise);
  }

  private ensureSummaryLoaded(date: string): Observable<void> {
    if (this.summaryCache[date] || this.fullCache[date]) return of(undefined);
    if (this.summaryLoadPromises[date]) return from(this.summaryLoadPromises[date] as Promise<void>);

    this.summaryLoadPromises[date] = new Promise<void>(async (resolve) => {
      try {
        const data = await firstValueFrom(this.http.get<any>(`${API_BASE_URL}/elections/${date}/summary`));
        const normalized = this.normalizePayload(data, { includeSections: false });
        this.summaryCache[date] = {
          regions: normalized?.regions || [],
          parties: normalized?.parties || {},
        };
      } catch {
        this.summaryCache[date] = {
          regions: [],
          parties: {},
        };
      } finally {
        delete this.summaryLoadPromises[date];
        resolve();
      }
    });

    return from(this.summaryLoadPromises[date] as Promise<void>);
  }

  private ensureFullDataLoaded(date: string): Observable<void> {
    if (this.fullCache[date]) return of(undefined);
    if (this.fullLoadPromises[date]) return from(this.fullLoadPromises[date]);

    this.loadingSubject.next(true);

    this.fullLoadPromises[date] = new Promise<void>(async (resolve, reject) => {
      try {
        const data = await firstValueFrom(this.http.get<any>(`${API_BASE_URL}/elections/${date}/full`));
        const normalized = this.normalizePayload(data);
        this.fullCache[date] = this.buildFullData(normalized);
        if (!this.summaryCache[date]) {
          this.summaryCache[date] = {
            regions: normalized?.regions || [],
            parties: normalized?.parties || {}
          };
        }
        this.loadingSubject.next(false);
        resolve();
      } catch (err) {
        console.error(`Error loading full election data for ${date}:`, err);
        this.loadingSubject.next(false);
        delete this.fullLoadPromises[date];
        reject(err);
      }
    });

    return from(this.fullLoadPromises[date]);
  }

  private ensureAllFullDataLoaded(): Observable<void> {
    const dates = this.datesSubject.value.map((d) => d.date);
    const pending = dates.filter((d) => !this.fullCache[d]);
    if (pending.length === 0) return of(undefined);

    this.loadingSubject.next(true);
    const promise = new Promise<void>(async (resolve) => {
      try {
        const payloads = await Promise.allSettled(
          pending.map(async (d) => {
            const data = await firstValueFrom(this.http.get<any>(`${API_BASE_URL}/elections/${d}/full`));
            return { date: d, data };
          })
        );

        for (let i = 0; i < payloads.length; i++) {
          const payload = payloads[i];
          const date = pending[i];
          if (payload.status !== 'fulfilled') {
            continue;
          }
          const normalized = this.normalizePayload(payload.value.data);
          this.fullCache[date] = this.buildFullData(normalized);
          if (!this.summaryCache[date]) {
            this.summaryCache[date] = {
              regions: normalized?.regions || [],
              parties: normalized?.parties || {}
            }
          }
        }
        this.loadingSubject.next(false);
        resolve();
      } catch (err) {
        console.error('Error loading full election data:', err);
        this.loadingSubject.next(false);
        resolve();
      }
    });

    return from(promise);
  }

  private ensureHistoricalFullDataLoaded(currentDate: string): Observable<void> {
    const dates = this.datesSubject.value.map((d) => d.date);
    const pending = dates.filter((d) => d !== currentDate && !this.fullCache[d]);
    if (pending.length === 0) return of(undefined);

    const promise = new Promise<void>(async (resolve) => {
      try {
        const payloads = await Promise.allSettled(
          pending.map(async (d) => {
            const data = await firstValueFrom(this.http.get<any>(`${API_BASE_URL}/elections/${d}/full`));
            return { date: d, data };
          })
        );

        for (let i = 0; i < payloads.length; i++) {
          const payload = payloads[i];
          const date = pending[i];
          if (payload.status !== 'fulfilled') {
            continue;
          }
          const normalized = this.normalizePayload(payload.value.data);
          this.fullCache[date] = this.buildFullData(normalized);
          if (!this.summaryCache[date]) {
            this.summaryCache[date] = {
              regions: normalized?.regions || [],
              parties: normalized?.parties || {}
            };
          }
        }
        resolve();
      } catch (err) {
        console.error('Error loading historical election data:', err);
        resolve();
      }
    });

    return from(promise);
  }

  getDates() {
    return this.datesSubject.value;
  }

  refreshDates(): Observable<ElectionDate[]> {
    return this.loadDates();
  }

  getAllData(): Observable<{ [date: string]: SummaryData }> {
    return this.ensureSummariesLoaded().pipe(map(() => this.summaryCache));
  }

  getSummary(date: string): Observable<SummaryData> {
    if (this.fullCache[date]) {
      return of({
        regions: this.fullCache[date]?.regions || [],
        parties: this.fullCache[date]?.parties || {},
      });
    }
    return this.ensureSummaryLoaded(date).pipe(
      map(() => this.summaryCache[date] || { regions: [], parties: {} })
    );
  }

  getAllFullData(): Observable<{ [date: string]: FullData }> {
    return this.ensureAllFullDataLoaded().pipe(
      map(() => {
        const out: { [date: string]: FullData } = {};
        for (const date of Object.keys(this.fullCache)) {
          out[date] = this.materializeFullData(date);
        }
        return out;
      })
    );
  }

  getRegions(date: string): Observable<Region[]> {
    if (this.fullCache[date]) {
      const regions = this.fullCache[date]?.regions || [];
      const parties = this.fullCache[date]?.parties || {};
      return of(this.normalizeRegionsTopParties(regions, parties));
    }
    return this.ensureSummaryLoaded(date).pipe(map(() => {
      const regions = this.summaryCache[date]?.regions || [];
      const parties = this.summaryCache[date]?.parties || {};
      return this.normalizeRegionsTopParties(regions, parties);
    }));
  }

  getSections(date: string, regionId?: string, withComparisons = false): Observable<Section[]> {
    const buildSections = (): Section[] => {
      const full = this.fullCache[date];
      if (!full) return [];
      if (!regionId || regionId === 'all') {
        return this.materializeSections(
          full,
          Array.from({ length: full.sections.count }, (_, i) => i),
          date,
          withComparisons
        );
      }
      const indexes = full.sectionsByRegion.get(regionId) || [];
      return this.materializeSections(full, indexes, date, withComparisons);
    };

    return this.ensureFullDataLoaded(date).pipe(
      switchMap(() => {
        if (!withComparisons) {
          return of(buildSections());
        }

        return concat(
          of(buildSections()),
          this.ensureHistoricalFullDataLoaded(date).pipe(
            map(() => buildSections()),
            catchError(() => of(buildSections()))
          )
        );
      })
    );
  }

  getParties(date: string): Observable<{ [id: string]: string }> {
    if (this.fullCache[date]) {
      return of(this.fullCache[date]?.parties || {});
    }
    return this.ensureSummaryLoaded(date).pipe(map(() => this.summaryCache[date]?.parties || {}));
  }

  getSectionDetails(date: string, sectionId: string): Observable<SectionDetails> {
    return this.ensureFullDataLoaded(date).pipe(
      map(() => {
        const full = this.fullCache[date];
        if (!full) throw new Error('Data not loaded');
        const index = full.sectionIdToIndex.get(sectionId);
        if (index === undefined) throw new Error('Section not found');
        const section = this.materializeSection(full, index);
        if (!section) throw new Error('Section not found');

        const partiesMap = full.parties;
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

  private normalizeRegionsTopParties(regions: Region[], parties: { [id: string]: string }): Region[] {
    if (!regions || regions.length === 0) return regions;
    return regions.map(region => {
      if (!region.topParties || region.topParties.length === 0) return region;
      const topParties = region.topParties.map(tp => ({
        ...tp,
        name: this.resolvePartyName(tp.partyId, tp.name, parties)
      }));
      return { ...region, topParties };
    });
  }
}
