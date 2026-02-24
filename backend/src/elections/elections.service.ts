import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { COMPACT_MAPPING } from './compact-mapping';

@Injectable()
export class ElectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.election.findMany({
      orderBy: { date: 'desc' },
      select: { id: true, date: true, name: true },
    });
  }

  getCompactMapping() {
    return COMPACT_MAPPING;
  }

  private async getElectionByDate(date: string) {
    const election = await this.prisma.election.findUnique({ where: { date } });
    if (!election) throw new NotFoundException('Election not found.');
    return election;
  }

  async getSummary(date: string) {
    const election = await this.getElectionByDate(date);
    const [regions, parties] = await Promise.all([
      this.prisma.electionRegion.findMany({
        where: { electionId: election.id },
        orderBy: { regionId: 'asc' },
      }),
      this.prisma.electionParty.findMany({
        where: { electionId: election.id },
        orderBy: { partyId: 'asc' },
      }),
    ]);

    if (regions.length === 0) {
      throw new NotFoundException('Election summary not available.');
    }

    const partiesMap: Record<string, string> = {};
    for (const party of parties) {
      partiesMap[party.partyId] = party.name;
    }

    return {
      regions: regions.map((r) => r.data || { id: r.regionId, name: r.name }),
      parties: partiesMap,
    };
  }

  async getFull(date: string) {
    const election = await this.getElectionByDate(date);
    const [sectionsRows, regions, parties] = await Promise.all([
      this.prisma.electionSection.findMany({
        where: { electionId: election.id },
        orderBy: { sectionId: 'asc' },
      }),
      this.prisma.electionRegion.findMany({
        where: { electionId: election.id },
        orderBy: { regionId: 'asc' },
      }),
      this.prisma.electionParty.findMany({
        where: { electionId: election.id },
        orderBy: { partyId: 'asc' },
      }),
    ]);

    if (sectionsRows.length === 0) {
      throw new NotFoundException('Election full data not available.');
    }

    const partiesMap: Record<string, string> = {};
    for (const party of parties) {
      partiesMap[party.partyId] = party.name;
    }

    const cityDict: string[] = [];
    const sectionDict: string[] = [];
    const cityIndex = new Map<string, number>();
    const sectionIndex = new Map<string, number>();
    const getDictId = (dict: string[], index: Map<string, number>, value: string): number => {
      const existing = index.get(value);
      if (existing !== undefined) return existing;
      const id = dict.length;
      dict.push(value);
      index.set(value, id);
      return id;
    };

    const sections: any = {
      count: sectionsRows.length,
      dicts: { cityName: cityDict, sectionName: sectionDict },
      sectionId: [] as string[],
      regionId: [] as string[],
      cityNameId: [] as number[],
      sectionNameId: [] as number[],
      sectionType: [] as number[],
      total: [] as number[],
      voted: [] as number[],
      discardedVotes: [] as number[],
      noVotes: [] as number[],
      noVotesPaper: [] as number[],
      noVotesMachine: [] as number[],
      totalPaper: [] as number[],
      totalMachine: [] as number[],
      activityBp: [] as number[],
      riskScore: [] as number[],
      hasProtocolError: [] as number[],
      protocolErrorDiff: [] as number[],
      protocolPaperVotes: [] as number[],
      protocolMachineVotes: [] as number[],
      votesToFirst: [] as number[],
      topPartyOffset: [0] as number[],
      topPartyPartyId: [] as string[],
      topPartyName: [] as string[],
      topPartyTotal: [] as number[],
      topPartyPercentBp: [] as number[],
      partyVotesOffset: [0] as number[],
      partyVotesPartyId: [] as string[],
      partyVotesTotal: [] as number[],
      partyVotesPaper: [] as number[],
      partyVotesMachine: [] as number[],
      candidateVotesOffset: [0] as number[],
      candidateVotesCandidateId: [] as string[],
      candidateVotesCandidateName: [] as string[],
      candidateVotesPartyId: [] as string[],
      candidateVotesTotal: [] as number[],
      candidateVotesPaper: [] as number[],
      candidateVotesMachine: [] as number[],
      riskOffset: [0] as number[],
      riskCode: [] as string[],
      riskCategory: [] as string[],
      riskSeverity: [] as string[],
      riskDetails: [] as string[],
      candidateRiskOffset: [0] as number[],
      candidateRiskCode: [] as string[],
      candidateRiskCategory: [] as string[],
      candidateRiskSeverity: [] as string[],
      candidateRiskDetails: [] as string[],
    };

    for (const row of sectionsRows) {
      sections.sectionId.push(row.sectionId);
      sections.regionId.push(row.regionId);
      sections.cityNameId.push(getDictId(cityDict, cityIndex, row.cityName || ''));
      sections.sectionNameId.push(getDictId(sectionDict, sectionIndex, row.sectionName || ''));

      const sectionTypeCode =
        row.sectionType === 'City' ? 0 : row.sectionType === 'Village' ? 1 : row.sectionType === 'Mobile' ? 2 : 3;
      sections.sectionType.push(sectionTypeCode);

      sections.total.push(row.total || 0);
      sections.voted.push(row.voted || 0);
      sections.discardedVotes.push(row.discardedVotes || 0);
      sections.noVotes.push(row.noVotes || 0);
      sections.noVotesPaper.push(row.noVotesPaper || 0);
      sections.noVotesMachine.push(row.noVotesMachine || 0);
      sections.totalPaper.push(row.totalPaper || 0);
      sections.totalMachine.push(row.totalMachine || 0);
      sections.activityBp.push(row.activityBp || 0);
      sections.riskScore.push(row.riskScore || 0);
      sections.hasProtocolError.push(row.hasProtocolError ? 1 : 0);
      sections.protocolErrorDiff.push(row.protocolErrorDiff || 0);
      sections.protocolPaperVotes.push(row.protocolPaperVotes || 0);
      sections.protocolMachineVotes.push(row.protocolMachineVotes || 0);
      sections.votesToFirst.push(row.votesToFirst || 0);

      const topParties = (row.topParties as any[]) || [];
      for (const item of topParties) {
        sections.topPartyPartyId.push(String(item.partyId || ''));
        sections.topPartyName.push(String(item.name || ''));
        sections.topPartyTotal.push(Number(item.total || 0));
        sections.topPartyPercentBp.push(Number(item.percentBp || 0));
      }
      sections.topPartyOffset.push(sections.topPartyPartyId.length);

      const partyVotes = (row.partyVotes as any[]) || [];
      for (const item of partyVotes) {
        sections.partyVotesPartyId.push(String(item.partyId || ''));
        sections.partyVotesTotal.push(Number(item.total || 0));
        sections.partyVotesPaper.push(Number(item.paper || 0));
        sections.partyVotesMachine.push(Number(item.machine || 0));
      }
      sections.partyVotesOffset.push(sections.partyVotesPartyId.length);

      const candidateVotes = (row.candidateVotes as any[]) || [];
      for (const item of candidateVotes) {
        sections.candidateVotesCandidateId.push(String(item.candidateId || ''));
        sections.candidateVotesCandidateName.push(String(item.candidateName || ''));
        sections.candidateVotesPartyId.push(String(item.partyId || ''));
        sections.candidateVotesTotal.push(Number(item.total || 0));
        sections.candidateVotesPaper.push(Number(item.paper || 0));
        sections.candidateVotesMachine.push(Number(item.machine || 0));
      }
      sections.candidateVotesOffset.push(sections.candidateVotesCandidateId.length);

      const risks = (row.riskIndicators as any[]) || [];
      for (const item of risks) {
        sections.riskCode.push(String(item.code || ''));
        sections.riskCategory.push(String(item.category || ''));
        sections.riskSeverity.push(String(item.severity || ''));
        sections.riskDetails.push(String(item.details || ''));
      }
      sections.riskOffset.push(sections.riskCode.length);

      const candidateRisks = (row.candidateRiskIndicators as any[]) || [];
      for (const item of candidateRisks) {
        sections.candidateRiskCode.push(String(item.code || ''));
        sections.candidateRiskCategory.push(String(item.category || ''));
        sections.candidateRiskSeverity.push(String(item.severity || ''));
        sections.candidateRiskDetails.push(String(item.details || ''));
      }
      sections.candidateRiskOffset.push(sections.candidateRiskCode.length);
    }

    return {
      version: 2,
      sections,
      parties: partiesMap,
      regions: regions.map((r) => r.data || { id: r.regionId, name: r.name }),
    };
  }

  async getSections(date: string) {
    const full = await this.getFull(date);
    if (!full || typeof full !== 'object') return [];
    return (full as any).sections ?? [];
  }

  async getSectionDetail(date: string, sectionId: string) {
    const full = await this.getFull(date);
    const sections = (full as any).sections;
    if (!sections || typeof sections !== 'object') {
      throw new NotFoundException('Election sections not available.');
    }

    if (sections.sectionId && sections.sectionId.length) {
      const index = sections.sectionId.findIndex((id: string) => String(id) === String(sectionId));
      if (index < 0) throw new NotFoundException('Section not found.');

      const detail: Record<string, unknown> = { index };
      for (const key of Object.keys(sections)) {
        if (key === 'dicts' || key === 'count') continue;
        const value = sections[key];
        if (Array.isArray(value)) {
          detail[key] = value[index];
        } else {
          detail[key] = value;
        }
      }

      detail.dicts = sections.dicts;
      return detail;
    }

    const arraySections = Array.isArray(sections) ? sections : [];
    const found = arraySections.find((s: any) => String(s.sectionId) === String(sectionId));
    if (!found) throw new NotFoundException('Section not found.');
    return found;
  }
}
