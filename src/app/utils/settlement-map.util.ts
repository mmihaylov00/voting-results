import { Section } from '../models/election.models';
import { MapMetric, MapPartyLeader, MapPreferenceLeader, MapAggregate } from './map-metric.helper';

export const REGION_ID_TO_GEOMETRY_CODE: Record<string, string> = {
  '1': 'BLG',
  '2': 'BGS',
  '3': 'VAR',
  '4': 'VTR',
  '5': 'VID',
  '6': 'VRC',
  '7': 'GAB',
  '8': 'DOB',
  '9': 'KRZ',
  '10': 'KNL',
  '11': 'LOV',
  '12': 'MON',
  '13': 'PAZ',
  '14': 'PER',
  '15': 'PVN',
  '16': 'PDV-00',
  '17': 'PDV',
  '18': 'RAZ',
  '19': 'RSE',
  '20': 'SLS',
  '21': 'SLV',
  '22': 'SML',
  '23': 'S23',
  '24': 'S24',
  '25': 'S25',
  '26': 'SFO',
  '27': 'SZR',
  '28': 'TGV',
  '29': 'HKV',
  '30': 'SHU',
  '31': 'JAM',
  '32': '32',
};

export const REGION_ID_TO_NAME: Record<string, string> = {
  '1': 'БЛАГОЕВГРАД',
  '2': 'БУРГАС',
  '3': 'ВАРНА',
  '4': 'ВЕЛИКО ТЪРНОВО',
  '5': 'ВИДИН',
  '6': 'ВРАЦА',
  '7': 'ГАБРОВО',
  '8': 'ДОБРИЧ',
  '9': 'КЪРДЖАЛИ',
  '10': 'КЮСТЕНДИЛ',
  '11': 'ЛОВЕЧ',
  '12': 'МОНТАНА',
  '13': 'ПАЗАРДЖИК',
  '14': 'ПЕРНИК',
  '15': 'ПЛЕВЕН',
  '16': 'ПЛОВДИВ-ГРАД',
  '17': 'ПЛОВДИВ-ОБЛАСТ',
  '18': 'РАЗГРАД',
  '19': 'РУСЕ',
  '20': 'СИЛИСТРА',
  '21': 'СЛИВЕН',
  '22': 'СМОЛЯН',
  '23': 'СОФИЯ 23 МИР',
  '24': 'СОФИЯ 24 МИР',
  '25': 'СОФИЯ 25 МИР',
  '26': 'СОФИЯ-ОБЛАСТ',
  '27': 'СТАРА ЗАГОРА',
  '28': 'ТЪРГОВИЩЕ',
  '29': 'ХАСКОВО',
  '30': 'ШУМЕН',
  '31': 'ЯМБОЛ',
  '32': 'ИЗВЪН СТРАНАТА',
};

export const GEOMETRY_CODE_TO_REGION_ID: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_ID_TO_GEOMETRY_CODE).map(([id, code]) => [code, id])
);

export type SettlementMapMetric = MapMetric;

export interface SettlementLookup {
  ekatte?: string;
  name?: string;
  obshtina?: string;
  nuts3?: string;
  oblast?: string;
}

export interface SettlementGeometryProperties {
  ekatte: string;
  nuts4: string;
  nuts3: string;
}

export interface SettlementGeometryFeature {
  type: 'Feature';
  properties: SettlementGeometryProperties;
  geometry: any;
}

export interface SettlementGeometryCollection {
  type: 'FeatureCollection';
  features: SettlementGeometryFeature[];
}

export type SettlementPartyLeader = MapPartyLeader;

export type SettlementPreferenceLeader = MapPreferenceLeader;

export interface SettlementAggregate extends MapAggregate {
  ekatte: string;
  geometryKey: string;
  regionId: string;
  regionName?: string;
  municipalityName?: string;
  geometryRegionCode: string;
  geometryMunicipalityCode?: string;
  cityName: string;
  displayName: string;
  sections: Section[];
}

export function getGeometryRegionCode(regionId: string | undefined | null): string {
  return REGION_ID_TO_GEOMETRY_CODE[String(regionId || '')] || '';
}

export function stripSettlementPrefix(name: string | undefined | null): string {
  if (!name) return '';
  return name.replace(/^(гр\.|с\.|кв\.|жк\.)\s*/i, '').trim();
}

const SOFIA_REGION_IDS = new Set(['23', '24', '25']);

const SOFIA_DISTRICT_NAMES: Record<string, string> = {
  S2302: 'Красно село',
  S2308: 'Изгрев',
  S2309: 'Лозенец',
  S2310: 'Триадица',
  S2315: 'Младост',
  S2316: 'Студентски',
  S2317: 'Витоша',
  S2323: 'Панчарево',
  S2401: 'Средец',
  S2403: 'Възраждане',
  S2404: 'Оборище',
  S2405: 'Сердика',
  S2406: 'Подуяне',
  S2407: 'Слатина',
  S2414: 'Искър',
  S2422: 'Кремиковци',
  S2511: 'Красна поляна',
  S2512: 'Илинден',
  S2513: 'Надежда',
  S2518: 'Овча купел',
  S2519: 'Люлин',
  S2520: 'Връбница',
  S2521: 'Нови Искър',
  S2524: 'Банкя',
};

function getSofiaDistrictCode(sectionId: string | undefined): string | null {
  if (!sectionId || sectionId.length < 6) {
    return null;
  }

  const districtCode = sectionId.slice(4, 6);
  return districtCode ? districtCode.padStart(2, '0') : null;
}

function buildGeometryKey(section: Section, ekatte: string): string {
  if (ekatte === '68134' && SOFIA_REGION_IDS.has(section.regionId)) {
    const districtCode = getSofiaDistrictCode(section.sectionId);
    if (districtCode) {
      return `${ekatte}-${section.regionId}${districtCode}`;
    }
  }

  return ekatte;
}

function getDisplayName(section: Section, geometryKey: string): string {
  if (geometryKey.startsWith('68134-')) {
    const districtKey = `S${geometryKey.slice('68134-'.length)}`;
    return SOFIA_DISTRICT_NAMES[districtKey] || `София ${geometryKey.slice(-2)}`;
  }

  return stripSettlementPrefix(section.cityName);
}

function rankPartyLeaders(a: SettlementPartyLeader, b: SettlementPartyLeader): number {
  return b.total - a.total
    || a.partyName.localeCompare(b.partyName, 'bg')
    || a.partyId.localeCompare(b.partyId, 'bg');
}

function rankPreferenceLeaders(a: SettlementPreferenceLeader, b: SettlementPreferenceLeader): number {
  return b.total - a.total
    || a.candidateName.localeCompare(b.candidateName, 'bg')
    || a.partyName.localeCompare(b.partyName, 'bg')
    || a.candidateId.localeCompare(b.candidateId, 'bg');
}

function getSectionAllRiskIndicators(section: Section): Array<{ code: string; category: string; severity: string; details?: any }> {
  const sectionRisks = section?.riskIndicators || [];
  const candidateRisks = ((section as any)?.candidateRiskIndicators || []).filter((risk: any) => {
    if (!risk.details?.sectionId) return true;
    return risk.details.sectionId === section.sectionId;
  });
  return [...sectionRisks, ...candidateRisks].filter(risk => risk.code !== 'R6.2' && risk.code !== 'R2.4');
}

export function aggregateSectionsBySettlement(
  sections: Section[],
  partiesById: { [id: string]: string }
): SettlementAggregate[] {
  const groups = new Map<string, SettlementAggregate>();

  for (const section of sections) {
    const ekatte = section.settlementEkatte?.trim();
    if (!ekatte || section.regionId === '32') continue;

    const geometryRegionCode = getGeometryRegionCode(section.regionId);
    if (!geometryRegionCode) continue;

    const geometryKey = buildGeometryKey(section, ekatte);

    let aggregate = groups.get(geometryKey);
    if (!aggregate) {
      aggregate = {
        ekatte,
        geometryKey,
        regionId: section.regionId,
        regionName: section.regionName,
        municipalityName: section.municipalityName,
        geometryRegionCode,
        geometryMunicipalityCode: geometryKey.startsWith('68134-') ? `S${geometryKey.slice('68134-'.length)}` : undefined,
        cityName: section.cityName,
        displayName: getDisplayName(section, geometryKey),
        sections: [],
        total: 0,
        voted: 0,
        discardedVotes: 0,
        noVotes: 0,
        totalPaper: 0,
        totalMachine: 0,
        totalElectors: 0,
        riskScore: 0,
        partyTotals: Object.create(null),
      };
      groups.set(geometryKey, aggregate);
    }

    aggregate.sections.push(section);
    aggregate.total += section.total || 0;
    aggregate.voted += section.voted || 0;
    aggregate.discardedVotes += section.discardedVotes || 0;
    aggregate.noVotes += section.noVotes || 0;
    aggregate.totalPaper += section.totalPaper || 0;
    aggregate.totalMachine += section.totalMachine || 0;
    aggregate.totalElectors += section.total || 0;
    aggregate.riskScore += getSectionAllRiskIndicators(section).length;

    for (const [partyId, votes] of Object.entries(section.partyVotes || {})) {
      aggregate.partyTotals[partyId] = (aggregate.partyTotals[partyId] || 0) + (votes.total || 0);
    }
  }

  return Array.from(groups.values()).map((aggregate) => {
    const partyLeaders = Object.entries(aggregate.partyTotals)
      .map(([partyId, total]) => ({
        partyId,
        partyName: partiesById[partyId] || partyId,
        total,
      }))
      .sort(rankPartyLeaders);

    const preferenceTotals = new Map<string, SettlementPreferenceLeader>();
    aggregate.sections.forEach((section) => {
      Object.values(section.candidateVotes || {}).forEach((candidate) => {
        const key = `${candidate.partyId}_${candidate.candidateId}`;
        const existing = preferenceTotals.get(key);
        if (existing) {
          existing.total += candidate.total || 0;
          return;
        }
        preferenceTotals.set(key, {
          candidateId: candidate.candidateId,
          candidateName: candidate.candidateName,
          partyId: candidate.partyId,
          partyName: candidate.partyName || partiesById[candidate.partyId] || candidate.partyId,
          total: candidate.total || 0,
        });
      });
    });

    const preferenceLeaders = Array.from(preferenceTotals.values()).sort(rankPreferenceLeaders);

    return {
      ...aggregate,
      leadingParty: partyLeaders[0],
      leadingPreference: preferenceLeaders[0],
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'bg'));
}
