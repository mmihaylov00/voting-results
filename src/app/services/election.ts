import { DestroyRef, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, from, catchError, firstValueFrom, switchMap } from 'rxjs';
import { CandidateVotes, ComparativeValue, PartyVotes, Section, SectionDetails, Region } from '../models/election.models';
import elections from '../../assets/elections.json';
import { decodeElectionData } from './election-data-parser';
import { ElectionDataWorker, ElectionWorkerUnavailableError } from './election-data-worker';
import compactMapping from '../../assets/compact-mapping.json';
import { normalizeAbroadSection } from '../utils/abroad-section.util';
import { ELECTION_TYPE } from '../utils/election-type';

type DataManifest = {
  timestamp: string;
  files: {
    [date: string]: {
      summaryBr?: string;
      summaryGz?: string;
      fullBr?: string;
      fullGz?: string;
      br?: string;
      gz?: string;
    };
  };
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
  settlementEkatte: string[];
  longitude: ArrayLike<number>;
  latitude: ArrayLike<number>;
  cityNameId: ArrayLike<number>;
  sectionNameId: ArrayLike<number>;
  sectionType: ArrayLike<number>;
  total: ArrayLike<number>;
  voted: ArrayLike<number>;
  discardedVotes: ArrayLike<number>;
  noVotes: ArrayLike<number>;
  noVotesPaper: ArrayLike<number>;
  noVotesMachine: ArrayLike<number>;
  totalPaper: ArrayLike<number>;
  totalMachine: ArrayLike<number>;
  activityBp: ArrayLike<number>;
  riskScore: ArrayLike<number>;
  hasProtocolError: ArrayLike<number>;
  protocolErrorDiff: ArrayLike<number>;
  protocolPaperVotes: ArrayLike<number>;
  protocolMachineVotes: ArrayLike<number>;
  votesToFirst: ArrayLike<number>;
  topPartyOffset: ArrayLike<number>;
  topPartyPartyId: string[];
  topPartyName: string[];
  topPartyTotal: ArrayLike<number>;
  topPartyPercentBp: ArrayLike<number>;
  partyVotesOffset: ArrayLike<number>;
  partyVotesPartyId: string[];
  partyVotesTotal: ArrayLike<number>;
  partyVotesPaper: ArrayLike<number>;
  partyVotesMachine: ArrayLike<number>;
  candidateVotesOffset: ArrayLike<number>;
  candidateVotesCandidateId: string[];
  candidateVotesCandidateName: string[];
  candidateVotesPartyId: string[];
  candidateVotesTotal: ArrayLike<number>;
  candidateVotesPaper: ArrayLike<number>;
  candidateVotesMachine: ArrayLike<number>;
  riskOffset: ArrayLike<number>;
  riskCode: string[];
  riskCategory: string[];
  riskSeverity: string[];
  riskDetails: string[];
  candidateRiskOffset: ArrayLike<number>;
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
  partyIdsByName: Map<string, Set<string>>;
  candidateVotesCache?: { index: number; votes: Record<string, CandidateVotes> };
  candidateRiskCache?: { index: number; indicators: NonNullable<Section['riskIndicators']> };
};

@Injectable({
  providedIn: 'root'
})
export class ElectionService {
  readonly electionType = inject(ELECTION_TYPE);
  private readonly officialNationalElectorsByDate: Record<string, number> = {
    '2026.10.25': 6637238,
    '2026.04.19': 6575151,
    '2024.10.27': 6601262,
    '2024.06.09': 6138050,
    '2023.04.02': 6594593,
  };

  private baseDataUrl = '/data';
  private electionDates = elections.filter(e => e.type === this.electionType);
  private summaryCache: { [date: string]: SummaryData } = {};
  private fullCache: { [date: string]: FullDataV2 } = {};
  private materializedFullCache: { [date: string]: FullData } = {};
  private materializedFullLoadPromises: { [date: string]: Promise<FullData> | undefined } = {};
  private riskHistoryCache: { [date: string]: FullData } = {};
  private riskHistoryLoadPromises: { [date: string]: Promise<FullData> | undefined } = {};

  private summariesLoaded = false;
  private summaryLoadPromise: Promise<void> | null = null;
  private summaryLoadPromises: { [date: string]: Promise<void> | undefined } = {};
  private fullLoadPromises: { [date: string]: Promise<void> | undefined } = {};
  private manifestPromise: Promise<DataManifest | null> | null = null;
  private readonly dataWorker = new ElectionDataWorker();

  private loadManifest(): Observable<DataManifest | null> {
    if (this.manifestPromise) return from(this.manifestPromise);
    this.manifestPromise = new Promise<DataManifest | null>((resolve) => {
      this.http
        .get<DataManifest>(`${this.baseDataUrl}/compiled/manifest.json`)
        .pipe(catchError(() => of(null)))
        .subscribe((manifest) => resolve(manifest));
    });
    return from(this.manifestPromise);
  }

  constructor(private http: HttpClient) {
    inject(DestroyRef).onDestroy(() => this.dataWorker.destroy());
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
    const partyIdsByName = new Map<string, Set<string>>();

    (data.regions || []).forEach((r: Region) => regionNameById.set(r.id, r.name));
    const partyIds = new Set<string>(Object.keys(data.parties || {}));
    for (const id of sections.partyVotesPartyId || []) if (id) partyIds.add(id);
    for (const id of partyIds) {
      const normalized = this.normalizePartyName(data.parties?.[id] || id);
      const ids = partyIdsByName.get(normalized) ?? new Set<string>();
      ids.add(id);
      partyIdsByName.set(normalized, ids);
    }

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
      regionNameById,
      partyIdsByName
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
    if (n.includes('ПРОГРЕСИВНА')) return 'ПБ';
    return name;
  }

  private resolvePartyName(partyId: string, name: string | undefined, parties?: { [id: string]: string }): string {
    const raw = (name || '').trim();
    const looksLikeId = !raw || raw === partyId || /^\d+$/.test(raw);
    const resolved = looksLikeId ? (parties?.[partyId] || raw || partyId) : raw;
    return this.normalizePartyName(resolved);
  }

  private getOtherDates(date: string): string[] {
    return this.electionDates.filter(d => d.date !== date && !('provisional' in d && d.provisional)).map(d => d.date);
  }

  private attachComparisons(date: string, section: Section): void {
    const others = this.getOtherDates(date).flatMap(d => {
      const full = this.fullCache[d];
      const index = full?.sectionIdToIndex.get(section.sectionId);
      return full && index !== undefined ? [{ date: d, full, index }] : [];
    });
    if (!others.length) return;

    const columns = {
      total: 'total', voted: 'voted', discardedVotes: 'discardedVotes', noVotes: 'noVotes',
      totalPaper: 'totalPaper', totalMachine: 'totalMachine', activityPercent: 'activityBp',
      noVotesPaper: 'noVotesPaper', noVotesMachine: 'noVotesMachine', noVotesPercent: 'noVotes',
    } as const;
    const comparisons: Record<string, ComparativeValue[]> = {};
    for (const [metric, column] of Object.entries(columns)) {
      Object.defineProperty(comparisons, metric, {
        enumerable: true,
        get: () => others.map(({ date: d, full, index }) => {
          const value = full.sections[column][index] || 0;
          const voted = full.sections.voted[index] || 0;
          return { d, v: metric === 'noVotesPercent' ? (voted > 0 ? Math.round(value / voted * 10000) : 0) : value };
        }),
      });
    }
    section.comparisons = comparisons;

    const names = new WeakMap<PartyVotes, string>();
    const descriptors: PropertyDescriptorMap = {};
    for (const metric of ['total', 'paper', 'machine', 'percent'] as const) {
      const field = metric === 'total' ? 'comparisons' : `${metric}Comparisons`;
      descriptors[field] = {
        enumerable: true,
        get(this: PartyVotes): ComparativeValue[] | undefined {
          const name = names.get(this)!;
          const values: ComparativeValue[] = [];
          for (const { date: d, full, index } of others) {
            const partyIds = full.partyIdsByName.get(name);
            if (!partyIds) continue;
            const s = full.sections;
            const start = s.partyVotesOffset[index] || 0;
            const end = s.partyVotesOffset[index + 1] ?? start;
            let matched = false;
            let value = 0;
            for (let i = start; i < end; i++) {
              if (!partyIds.has(s.partyVotesPartyId[i])) continue;
              matched = true;
              value += (metric === 'paper' ? s.partyVotesPaper[i] : metric === 'machine' ? s.partyVotesMachine[i] : s.partyVotesTotal[i]) || 0;
            }
            if (!matched) continue;
            const voted = s.voted[index] || 0;
            values.push({ d, v: metric === 'percent' ? (voted > 0 ? Math.round(value / voted * 10000) : 0) : value });
          }
          return values.length ? values : undefined;
        },
      };
    }
    for (const [id, votes] of Object.entries(section.partyVotes)) {
      names.set(votes, this.normalizePartyName(this.fullCache[date]?.parties[id] || id));
      Object.defineProperties(votes, descriptors);
    }
  }

  private materializeCandidateVotes(full: FullDataV2, index: number): Record<string, CandidateVotes> {
    if (full.candidateVotesCache?.index === index) return full.candidateVotesCache.votes;
    const s = full.sections;
    const start = s.candidateVotesOffset[index] || 0;
    const end = s.candidateVotesOffset[index + 1] ?? start;
    const votes: Record<string, CandidateVotes> = Object.create(null);
    for (let i = start; i < end; i++) {
      const candidateId = s.candidateVotesCandidateId[i] || '';
      const partyId = s.candidateVotesPartyId[i] || '';
      if (!candidateId || !partyId) continue;
      votes[`${partyId}_${candidateId}`] = {
        candidateId, partyId, candidateName: s.candidateVotesCandidateName[i] || '',
        partyName: full.parties[partyId] || partyId,
        total: s.candidateVotesTotal[i] || 0, paper: s.candidateVotesPaper[i] || 0, machine: s.candidateVotesMachine[i] || 0,
      };
    }
    // One section per election stays expanded for repeated reads, rather than the entire archive.
    full.candidateVotesCache = { index, votes };
    return votes;
  }

  private materializePartyVotes(full: FullDataV2, index: number): Record<string, PartyVotes> {
    const s = full.sections;
    const start = s.partyVotesOffset[index] || 0;
    const end = s.partyVotesOffset[index + 1] ?? start;
    const votes: Record<string, PartyVotes> = Object.create(null);
    for (let i = start; i < end; i++) {
      const id = s.partyVotesPartyId[i];
      if (id) votes[id] = { total: s.partyVotesTotal[i] || 0, paper: s.partyVotesPaper[i] || 0, machine: s.partyVotesMachine[i] || 0 };
    }
    return votes;
  }

  private materializeCandidateRisks(full: FullDataV2, index: number): NonNullable<Section['riskIndicators']> {
    if (full.candidateRiskCache?.index === index) return full.candidateRiskCache.indicators;
    const s = full.sections;
    const start = s.candidateRiskOffset[index] || 0;
    const end = s.candidateRiskOffset[index + 1] ?? start;
    const sectionId = s.sectionId[index] || '';
    const indicators: NonNullable<Section['riskIndicators']> = [];
    for (let i = start; i < end; i++) {
      const rawDetails = this.parseRiskDetails(s.candidateRiskDetails[i]);
      const details = (rawDetails && typeof rawDetails === 'object')
        ? { ...rawDetails, sectionId: (rawDetails as any).sectionId ?? sectionId }
        : { sectionId };
      indicators.push({
        code: s.candidateRiskCode[i] || '', category: s.candidateRiskCategory[i] || '',
        severity: s.candidateRiskSeverity[i] || '', details,
      });
    }
    full.candidateRiskCache = { index, indicators };
    return indicators;
  }

  private materializeSection(full: FullDataV2, index: number, projection: 'full' | 'risk' | 'history' = 'full'): Section {
    const s = full.sections;
    const regionId = s.regionId[index] || '';
    const cityName = s.dicts.cityName[s.cityNameId[index]] || '';
    const sectionName = s.dicts.sectionName[s.sectionNameId[index]] || '';
    const sectionTypeMap = ['City', 'Village', 'Mobile', 'Other'];

    const section: Section = {
      sectionId: s.sectionId[index] || '',
      regionId,
      regionName: full.regionNameById.get(regionId),
      settlementEkatte: s.settlementEkatte[index] || '',
      longitude: Number.isFinite(s.longitude[index]) && s.longitude[index] !== 0 ? s.longitude[index] : undefined,
      latitude: Number.isFinite(s.latitude[index]) && s.latitude[index] !== 0 ? s.latitude[index] : undefined,
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
    let winningVotes = 0;
    if (projection === 'risk') {
      for (let i = pvStart; i < pvEnd; i++) {
        if (s.partyVotesPartyId[i] !== '0') winningVotes = Math.max(winningVotes, s.partyVotesTotal[i] || 0);
      }
    }
    for (let i = pvStart; projection !== 'history' && i < pvEnd; i++) {
      const pid = s.partyVotesPartyId[i] || '';
      if (!pid) continue;
      if (projection === 'risk' && (pid === '0' || !winningVotes || s.partyVotesTotal[i] !== winningVotes)) continue;
      (section.partyVotes as any)[pid] = {
        total: s.partyVotesTotal[i] || 0,
        paper: s.partyVotesPaper[i] || 0,
        machine: s.partyVotesMachine[i] || 0
      };
    }

    const riskStart = s.riskOffset[index] || 0;
    const riskEnd = s.riskOffset[index + 1] ?? riskStart;
    if (projection === 'risk') section.riskIndicators = [];
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

    const normalized = normalizeAbroadSection(section);
    if (projection !== 'risk' && (s.candidateRiskOffset[index + 1] || 0) > (s.candidateRiskOffset[index] || 0)) {
      Object.defineProperty(normalized, 'candidateRiskIndicators', {
        enumerable: true, get: () => this.materializeCandidateRisks(full, index),
      });
    }
    if (projection === 'history') {
      Object.defineProperty(normalized, 'partyVotes', {
        enumerable: true, get: () => this.materializePartyVotes(full, index),
      });
    }
    if (projection !== 'risk' && (s.candidateVotesOffset[index + 1] || 0) > (s.candidateVotesOffset[index] || 0)) {
      Object.defineProperty(normalized, 'candidateVotes', {
        enumerable: true, get: () => this.materializeCandidateVotes(full, index),
      });
    }
    return normalized;
  }

  private async materializeSections(
    full: FullDataV2, indexes: number[], date?: string, withComparisons = false,
    projection: 'full' | 'risk' | 'history' = 'full',
  ): Promise<Section[]> {
    const sections: Section[] = [];
    for (let start = 0; start < indexes.length; start += 200) {
      for (const index of indexes.slice(start, start + 200)) {
        const section = this.materializeSection(full, index, projection);
        if (withComparisons && date) this.attachComparisons(date, section);
        sections.push(section);
      }
      if (start + 200 < indexes.length) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return sections;
  }

  private materializeFullData(date: string): Promise<FullData> {
    const cached = this.materializedFullCache[date];
    if (cached) return Promise.resolve(cached);
    const pending = this.materializedFullLoadPromises[date];
    if (pending) return pending;
    const full = this.fullCache[date];
    const load = this.materializeSections(
      full, Array.from({ length: full.sections.count }, (_, i) => i), undefined, false, 'history',
    ).then(sections => {
      const materialized = { sections, parties: full.parties, regions: full.regions };
      this.materializedFullCache[date] = materialized;
      return materialized;
    }).finally(() => { delete this.materializedFullLoadPromises[date]; });
    this.materializedFullLoadPromises[date] = load;
    return load;
  }

  private fetchAndParse(url: string, opts?: { includeSections?: boolean }): Observable<any> {
    const download = () => this.http.get(url, { responseType: 'arraybuffer' });
    return download().pipe(
      switchMap(buffer => {
        const parsed = this.dataWorker.parse(buffer, url);
        if (!parsed) return of(decodeElectionData(buffer, url));
        return from(parsed).pipe(catchError((error: unknown) => {
          if (!(error instanceof ElectionWorkerUnavailableError)) throw error;
          // The worker owns the transferred buffer, so retry the download before the fallback parser.
          return download().pipe(map(data => decodeElectionData(data, url)));
        }));
      }),
      map(payload => this.normalizePayload(payload, opts)),
    );
  }

  private resolveUrls(date: string, manifest: DataManifest | null, kind: 'summary' | 'full') {
    const manifestFiles = manifest?.files?.[date] || {};
    const gzKey = kind === 'summary' ? 'summaryGz' : 'fullGz';
    const brKey = kind === 'summary' ? 'summaryBr' : 'fullBr';
    const gzFile = (manifestFiles as any)[gzKey] || manifestFiles.gz || `${date}.${kind}.json.gz`;
    const brFile = (manifestFiles as any)[brKey] || manifestFiles.br || `${date}.${kind}.json.br`;
    return {
      br: `${this.baseDataUrl}/compiled/${brFile}`,
      gz: `${this.baseDataUrl}/compiled/${gzFile}`,
    };
  }

  private ensureSummariesLoaded(): Observable<void> {
    if (this.summariesLoaded) return of(undefined);
    if (this.summaryLoadPromise) return from(this.summaryLoadPromise);

    const dates = this.electionDates.map((d) => d.date);

    this.summaryLoadPromise = new Promise<void>(async (resolve, reject) => {
      try {
        for (const d of dates) {
          await firstValueFrom(this.ensureSummaryLoaded(d));
        }

        this.summariesLoaded = true;
        resolve();
      } catch (err) {
        this.summaryLoadPromise = null;
        reject(err);
      }
    });

    return from(this.summaryLoadPromise);
  }

  private ensureSummaryLoaded(date: string): Observable<void> {
    if (this.summaryCache[date] || !this.electionDates.some(election => election.date === date)) return of(undefined);
    if (this.summaryLoadPromises[date]) return from(this.summaryLoadPromises[date]);

    const load = (async () => {
      const manifest = await firstValueFrom(this.loadManifest());
      const urls = this.resolveUrls(date, manifest, 'summary');
      const data = await firstValueFrom(
        this.fetchAndParse(urls.gz, { includeSections: false }).pipe(
          catchError(() => this.fetchAndParse(urls.br, { includeSections: false }))
        )
      );
      this.summaryCache[date] = {
        regions: data?.regions || [],
        parties: data?.parties || {}
      };
    })().finally(() => {
      delete this.summaryLoadPromises[date];
    });
    this.summaryLoadPromises[date] = load;
    return from(load);
  }

  private ensureFullDataLoaded(date: string): Observable<void> {
    if (this.fullCache[date]) return of(undefined);
    if (this.fullLoadPromises[date]) return from(this.fullLoadPromises[date]);

    this.fullLoadPromises[date] = new Promise<void>(async (resolve, reject) => {
      try {
        const manifest = await firstValueFrom(this.loadManifest());
        const urls = this.resolveUrls(date, manifest, 'full');
        const data = await firstValueFrom(
          this.fetchAndParse(urls.gz).pipe(catchError(() => this.fetchAndParse(urls.br)))
        );
        this.fullCache[date] = this.buildFullData(data);
        if (!this.summaryCache[date]) {
          this.summaryCache[date] = {
            regions: data?.regions || [],
            parties: data?.parties || {}
          };
        }
        resolve();
      } catch (err) {
        console.error(`Error loading full election data for ${date}:`, err);
        delete this.fullLoadPromises[date];
        reject(err);
      }
    });

    return from(this.fullLoadPromises[date]);
  }

  private ensureAllFullDataLoaded(): Observable<void> {
    const dates = this.electionDates.map((d) => d.date);
    const pending = dates.filter((d) => !this.fullCache[d]);
    if (pending.length === 0) return of(undefined);

    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        for (const d of pending) {
          await firstValueFrom(this.ensureFullDataLoaded(d));
        }
        resolve();
      } catch (err) {
        console.error('Error loading full election data:', err);
        reject(err);
      }
    });

    return from(promise);
  }

  getDates() {
    return this.electionDates;
  }

  getOfficialNationalElectors(date: string): number | null {
    return this.officialNationalElectorsByDate[date] ?? null;
  }

  getAllData(): Observable<{ [date: string]: SummaryData }> {
    return this.ensureSummariesLoaded().pipe(map(() => this.summaryCache));
  }

  getAllFullData(): Observable<{ [date: string]: FullData }> {
    return this.ensureAllFullDataLoaded().pipe(
      switchMap(async () => {
        const out: { [date: string]: FullData } = {};
        for (const date of Object.keys(this.fullCache)) out[date] = await this.materializeFullData(date);
        return out;
      })
    );
  }

  private loadRiskHistoryElection(date: string): Promise<FullData> {
    const cached = this.riskHistoryCache[date];
    if (cached) return Promise.resolve(cached);
    const pending = this.riskHistoryLoadPromises[date];
    if (pending) return pending;

    const load = (async (): Promise<FullData> => {
      let full = this.fullCache[date];
      if (!full) {
        const manifest = await firstValueFrom(this.loadManifest());
        const urls = this.resolveUrls(date, manifest, 'full');
        const data = await firstValueFrom(this.fetchAndParse(urls.gz).pipe(catchError(() => this.fetchAndParse(urls.br))));
        full = this.buildFullData(data);
      }
      return {
        sections: await this.materializeSections(full, Array.from({ length: full.sections.count }, (_, index) => index), undefined, false, 'risk'),
        parties: full.parties,
        regions: full.regions,
      };
    })();
    const result = load.then((data) => {
      this.riskHistoryCache[date] = data;
      delete this.riskHistoryLoadPromises[date];
      return data;
    }, (error: unknown) => {
      delete this.riskHistoryLoadPromises[date];
      throw error;
    });
    this.riskHistoryLoadPromises[date] = result;
    return result;
  }

  /** Compact risk snapshots contain winner votes only and omit candidate detail. */
  getRiskHistoryData(date: string): Observable<{ [date: string]: FullData }> {
    const current = this.electionDates.find((election) => election.date === date);
    if (!current) return of({});
    const dates = this.electionDates.filter((election) => election.type === current.type
      && election.round === current.round && election.date <= date);
    return from((async () => {
      const history: { [date: string]: FullData } = {};
      // Keep one raw election in memory at a time instead of retaining all candidate arrays.
      for (const election of dates) history[election.date] = await this.loadRiskHistoryElection(election.date);
      return history;
    })());
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
    const ensure$ = withComparisons ? this.ensureAllFullDataLoaded() : this.ensureFullDataLoaded(date);
    return ensure$.pipe(
      switchMap(async () => {
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
          percent: section.voted > 0 ? votes.total / section.voted : 0,
          percentBp: section.voted > 0 ? Math.round((votes.total / section.voted) * 10000) : 0
        })).sort((a, b) => b.total - a.total);

        if (section.noVotes > 0) {
          partyResults.push({
            partyId: 'no_votes',
            partyName: 'Не подкрепя никого',
            total: section.noVotes,
            paper: section.noVotesPaper || 0,
            machine: section.noVotesMachine || 0,
            percent: section.voted > 0 ? section.noVotes / section.voted : 0,
            percentBp: section.voted > 0 ? Math.round((section.noVotes / section.voted) * 10000) : 0
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
