import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, BehaviorSubject, from, catchError, firstValueFrom } from 'rxjs';
import { Section, SectionDetails, Region } from '../models/election.models';
import elections from '../../assets/elections.json';
import * as pako from 'pako';
import compactMapping from '../../assets/compact-mapping.json';

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
  private baseDataUrl = '/data';
  private electionDates = elections;
  private summaryCache: { [date: string]: SummaryData } = {};
  private fullCache: { [date: string]: FullDataV2 } = {};
  private materializedFullCache: { [date: string]: FullData } = {};
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private summariesLoaded = false;
  private summaryLoadPromise: Promise<void> | null = null;
  private fullLoadPromises: { [date: string]: Promise<void> | undefined } = {};
  private manifestPromise: Promise<DataManifest | null> | null = null;

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

  private getOtherDates(date: string): string[] {
    return this.electionDates.map((d) => d.date).filter((d) => d !== date);
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
      section.topParties.push({
        partyId: s.topPartyPartyId[i] || '',
        name: s.topPartyName[i] || '',
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
        (section as any).candidateRiskIndicators.push({
          code: s.candidateRiskCode[i] || '',
          category: s.candidateRiskCategory[i] || '',
          severity: s.candidateRiskSeverity[i] || '',
          details: this.parseRiskDetails(s.candidateRiskDetails[i])
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

  private fetchAndParse(url: string, opts?: { includeSections?: boolean }): Observable<any> {
    const start = performance.now();
    console.log(`[data] fetching ${url}`);
    return this.http.get(url, { responseType: 'arraybuffer' }).pipe(
      map((data: ArrayBuffer) => {
        console.log(`[data] downloaded ${url} (${data.byteLength} bytes, ${Math.round(performance.now() - start)}ms)`);
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
            console.log(`[data] ungzip ${url}`);
            decompressed = pako.ungzip(uint8);
          } else {
            // Data is not gzipped or already decompressed by the browser (Content-Encoding: gzip/br)
            console.log(`[data] raw decode ${url}`);
            decompressed = uint8;
          }

          console.log(`[data] decompressed ${url} (${decompressed.byteLength} bytes)`);
          const jsonString = new TextDecoder().decode(decompressed);
          console.log(`[data] decoded ${url} (${jsonString.length} chars)`);
          const parsed = JSON.parse(jsonString);
          console.log(`[data] parsed ${url}`);
          const expanded = this.normalizePayload(parsed, opts);
          console.log(`[data] expanded ${url}`);
          return expanded;
        } catch (e) {
          const firstBytes = Array.from(uint8.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.error(`Error decompressing/parsing data from ${url}. First bytes: ${firstBytes}`, e);
          throw e;
        }
      })
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

    this.loadingSubject.next(true);
    const dates = this.electionDates.map((d) => d.date);

    this.summaryLoadPromise = new Promise<void>(async (resolve, reject) => {
      try {
        const manifest = await firstValueFrom(this.loadManifest());
        console.log('[data] manifest loaded', manifest);

        for (const d of dates) {
          if (this.summaryCache[d]) continue;
          const urls = this.resolveUrls(d, manifest, 'summary');
          console.log(`[data] resolve summary ${d}`, urls);
          const data = await firstValueFrom(
            this.fetchAndParse(urls.gz, { includeSections: false }).pipe(
              catchError(() => this.fetchAndParse(urls.br, { includeSections: false }))
            )
          );
          this.summaryCache[d] = {
            regions: data?.regions || [],
            parties: data?.parties || {}
          };
          console.log(`[data] summary cached ${d}`);
        }

        this.summariesLoaded = true;
        this.loadingSubject.next(false);
        console.log('[data] summary load complete');
        resolve();
      } catch (err) {
        console.error('Error loading election summaries:', err);
        this.loadingSubject.next(false);
        this.summaryLoadPromise = null;
        reject(err);
      }
    });

    return from(this.summaryLoadPromise);
  }

  private ensureFullDataLoaded(date: string): Observable<void> {
    if (this.fullCache[date]) return of(undefined);
    if (this.fullLoadPromises[date]) return from(this.fullLoadPromises[date]);

    this.loadingSubject.next(true);

    this.fullLoadPromises[date] = new Promise<void>(async (resolve, reject) => {
      try {
        const manifest = await firstValueFrom(this.loadManifest());
        const urls = this.resolveUrls(date, manifest, 'full');
        console.log(`[data] resolve full ${date}`, urls);
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
        console.log(`[data] full cached ${date}`);
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
    const dates = this.electionDates.map((d) => d.date);
    const pending = dates.filter((d) => !this.fullCache[d]);
    if (pending.length === 0) return of(undefined);

    this.loadingSubject.next(true);
    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        const manifest = await firstValueFrom(this.loadManifest());
        for (const d of pending) {
          const urls = this.resolveUrls(d, manifest, 'full');
          console.log(`[data] resolve full ${d}`, urls);
          const data = await firstValueFrom(
            this.fetchAndParse(urls.gz).pipe(catchError(() => this.fetchAndParse(urls.br)))
          );
          this.fullCache[d] = this.buildFullData(data);
          if (!this.summaryCache[d]) {
            this.summaryCache[d] = {
              regions: data?.regions || [],
              parties: data?.parties || {}
            };
          }
          console.log(`[data] full cached ${d}`);
        }
        this.loadingSubject.next(false);
        resolve();
      } catch (err) {
        console.error('Error loading full election data:', err);
        this.loadingSubject.next(false);
        reject(err);
      }
    });

    return from(promise);
  }

  getDates() {
    return this.electionDates;
  }

  getAllData(): Observable<{ [date: string]: SummaryData }> {
    return this.ensureSummariesLoaded().pipe(map(() => this.summaryCache));
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
      return of(this.fullCache[date]?.regions || []);
    }
    return this.ensureSummariesLoaded().pipe(map(() => this.summaryCache[date]?.regions || []));
  }

  getSections(date: string, regionId?: string, withComparisons = false): Observable<Section[]> {
    const ensure$ = withComparisons ? this.ensureAllFullDataLoaded() : this.ensureFullDataLoaded(date);
    return ensure$.pipe(
      map(() => {
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
    return this.ensureSummariesLoaded().pipe(map(() => this.summaryCache[date]?.parties || {}));
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
}
