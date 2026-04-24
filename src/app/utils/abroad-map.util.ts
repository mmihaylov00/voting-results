import { Section } from '../models/election.models';

import { MapMetric, MapPartyLeader, MapPreferenceLeader, MapAggregate } from './map-metric.helper';

export interface AbroadCountryManifestItem {
  name: string;
  code: string;
  capitalLocation: string | null;
}

export interface AbroadCountryGeometryFeature {
  type: 'Feature';
  properties: {
    name: string;
    iso2: string;
    iso3: string;
  };
  geometry: any;
}

export interface AbroadCountryGeometryCollection {
  type: 'FeatureCollection';
  features: AbroadCountryGeometryFeature[];
}

export type AbroadPartyLeader = MapPartyLeader;

export type AbroadPreferenceLeader = MapPreferenceLeader;

export interface AbroadCountryAggregate extends MapAggregate {
  id: string;
  countryName: string;
  countryCode: string | null;
  normalizedCountryName: string;
  sections: Section[];
}

export interface AbroadCityAggregate extends MapAggregate {
  id: string;
  countryName: string;
  countryCode: string | null;
  cityName: string;
  displayName: string;
  normalizedCountryName: string;
  normalizedCityName: string;
  longitude: number | null;
  latitude: number | null;
  sections: Section[];
}

export interface AbroadMapSummary extends MapAggregate {
  label: string;
  countryCount: number;
  cityCount: number;
  sectionCount: number;
}

type AbroadCityGroup = AbroadCityAggregate & {
  longitudeSum: number;
  latitudeSum: number;
  coordinateCount: number;
};

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  'германия фр': 'германия',
  'фр германия': 'германия',
  'великобритания': 'обединено кралство',
  'англия': 'обединено кралство',
  'обединено кралство великобритания и северна ирландия': 'обединено кралство',
  'великобритания и северна ирландия': 'обединено кралство',
  'република македония': 'северна македония',
  'македония': 'северна македония',
  'чешка република': 'чехия',
  'република южна африка': 'южна африка',
  'корея': 'република корея',
  'съединени американски щати': 'сащ',
  'американски съединени щати': 'сащ',
  'обединени американски щати': 'сащ',
};

export const GEOMETRY_ISO_ALIASES: Record<string, string> = {
  FR: 'France',
  NO: 'Norway',
  XK: 'Kosovo',
};

function normalizeAbroadName(value: string | undefined | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeCountryName(countryName: string): string {
  const normalized = normalizeAbroadName(countryName);
  return COUNTRY_NAME_ALIASES[normalized] || normalized;
}

function normalizeCityName(cityName: string): string {
  return normalizeAbroadName(cityName);
}

function rankPartyLeaders(a: AbroadPartyLeader, b: AbroadPartyLeader): number {
  return b.total - a.total
    || a.partyName.localeCompare(b.partyName, 'bg')
    || a.partyId.localeCompare(b.partyId, 'bg');
}

function rankPreferenceLeaders(a: AbroadPreferenceLeader, b: AbroadPreferenceLeader): number {
  return b.total - a.total
    || a.candidateName.localeCompare(b.candidateName, 'bg')
    || a.partyName.localeCompare(b.partyName, 'bg')
    || a.candidateId.localeCompare(b.candidateId, 'bg');
}

function isValidCoordinate(longitude: number | undefined, latitude: number | undefined): boolean {
  return Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && Math.abs(longitude || 0) <= 180
    && Math.abs(latitude || 0) <= 90
    && !((longitude || 0) === 0 && (latitude || 0) === 0);
}

export function getAbroadNameParts(cityName: string): {
  countryName: string;
  cityName: string;
  displayName: string;
} {
  const parts = cityName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const countryName = parts[0] || cityName.trim();
  const parsedCityName = parts.length > 1 ? (parts[parts.length - 1] || countryName) : countryName;
  const displayName = countryName === parsedCityName ? countryName : `${countryName}, ${parsedCityName}`;

  return {
    countryName,
    cityName: parsedCityName,
    displayName,
  };
}

export function getAbroadCountryName(cityName: string): string {
  return getAbroadNameParts(cityName).countryName;
}

export function getAbroadCityName(cityName: string): string {
  return getAbroadNameParts(cityName).cityName;
}

export function buildAbroadCountryCodeMap(
  manifest: AbroadCountryManifestItem[]
): Map<string, AbroadCountryManifestItem> {
  const map = new Map<string, AbroadCountryManifestItem>();

  manifest.forEach((item) => {
    map.set(normalizeCountryName(item.name), item);
  });

  Object.entries(COUNTRY_NAME_ALIASES).forEach(([alias, canonical]) => {
    const match = map.get(canonical);
    if (match) {
      map.set(alias, match);
    }
  });

  return map;
}

function resolveManifestCountry(
  rawCountryName: string,
  manifestByName: Map<string, AbroadCountryManifestItem>,
  manifest: AbroadCountryManifestItem[]
): AbroadCountryManifestItem | null {
  const normalized = normalizeCountryName(rawCountryName);
  const direct = manifestByName.get(normalized);
  if (direct) {
    return direct;
  }

  return manifest.find((item) => {
    const itemName = normalizeCountryName(item.name);
    return normalized.startsWith(itemName)
      || itemName.startsWith(normalized)
      || normalized.includes(itemName);
  }) || null;
}

export function resolveAbroadSectionLocation(
  section: Pick<Section, 'cityName' | 'sectionName'>,
  countryManifest: AbroadCountryManifestItem[] = []
): {
  countryName: string;
  cityName: string;
  displayName: string;
  countryCode: string | null;
  normalizedCountryName: string;
  normalizedCityName: string;
} {
  const manifestByName = buildAbroadCountryCodeMap(countryManifest);
  const parsedCity = getAbroadNameParts(section.cityName);
  const parsedSection = getAbroadNameParts(section.sectionName || '');

  let manifestItem = resolveManifestCountry(parsedCity.countryName, manifestByName, countryManifest);
  let countryName = manifestItem?.name || parsedCity.countryName;
  let cityName = parsedCity.cityName;

  if (!manifestItem && section.sectionName) {
    manifestItem = resolveManifestCountry(parsedSection.countryName, manifestByName, countryManifest);
    if (manifestItem) {
      countryName = manifestItem.name;
      cityName = parsedCity.countryName === parsedCity.cityName ? parsedSection.cityName || parsedCity.cityName : parsedCity.cityName;
    }
  }

  const normalizedCountryName = normalizeCountryName(countryName);
  const normalizedCityName = normalizeCityName(cityName);
  const displayName = countryName === cityName ? countryName : `${countryName}, ${cityName}`;

  return {
    countryName,
    cityName,
    displayName,
    countryCode: manifestItem?.code || null,
    normalizedCountryName,
    normalizedCityName,
  };
}

export function aggregateAbroadSectionsByCity(
  sections: Section[],
  partiesById: Record<string, string>,
  countryManifest: AbroadCountryManifestItem[] = []
): AbroadCityAggregate[] {
  const groups = new Map<string, AbroadCityGroup>();

  for (const section of sections) {
    if (section.regionId !== '32') {
      continue;
    }

    const resolved = resolveAbroadSectionLocation(section, countryManifest);
    const groupKey = `${resolved.countryCode || resolved.normalizedCountryName}::${resolved.normalizedCityName}`;

    let aggregate = groups.get(groupKey);
    if (!aggregate) {
      aggregate = {
        id: groupKey,
        countryName: resolved.countryName,
        countryCode: resolved.countryCode,
        cityName: resolved.cityName,
        displayName: resolved.displayName,
        normalizedCountryName: resolved.normalizedCountryName,
        normalizedCityName: resolved.normalizedCityName,
        longitude: null,
        latitude: null,
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
        longitudeSum: 0,
        latitudeSum: 0,
        coordinateCount: 0,
      };
      groups.set(groupKey, aggregate);
    }

    aggregate.sections.push(section);
    aggregate.total += section.total || 0;
    aggregate.voted += section.voted || 0;
    aggregate.discardedVotes += section.discardedVotes || 0;
    aggregate.noVotes += section.noVotes || 0;
    aggregate.totalPaper += section.totalPaper || 0;
    aggregate.totalMachine += section.totalMachine || 0;
    aggregate.totalElectors += section.total || 0;
    aggregate.riskScore += section.riskScore || section.riskIndicators?.length || 0;

    if (isValidCoordinate(section.longitude, section.latitude)) {
      aggregate.longitudeSum += section.longitude as number;
      aggregate.latitudeSum += section.latitude as number;
      aggregate.coordinateCount += 1;
    }

    Object.entries(section.partyVotes || {}).forEach(([partyId, votes]) => {
      aggregate!.partyTotals[partyId] = (aggregate!.partyTotals[partyId] || 0) + (votes.total || 0);
    });
  }

  return Array.from(groups.values())
    .map((aggregate) => {
      const partyLeaders = Object.entries(aggregate.partyTotals)
        .map(([partyId, total]) => ({
          partyId,
          partyName: partiesById[partyId] || partyId,
          total,
        }))
        .sort(rankPartyLeaders);

      const preferenceTotals = new Map<string, AbroadPreferenceLeader>();
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

      return {
        ...aggregate,
        longitude: aggregate.coordinateCount > 0 ? aggregate.longitudeSum / aggregate.coordinateCount : null,
        latitude: aggregate.coordinateCount > 0 ? aggregate.latitudeSum / aggregate.coordinateCount : null,
        leadingParty: partyLeaders[0],
        leadingPreference: Array.from(preferenceTotals.values()).sort(rankPreferenceLeaders)[0],
      };
    })
    .sort((a, b) =>
      a.countryName.localeCompare(b.countryName, 'bg')
      || a.cityName.localeCompare(b.cityName, 'bg')
    );
}

export function buildAbroadSummary(
  cities: AbroadCityAggregate[],
  label: string
): AbroadMapSummary {
  const partyTotals: Record<string, number> = Object.create(null);
  const countries = new Set<string>();
  let total = 0;
  let voted = 0;
  let discardedVotes = 0;
  let noVotes = 0;
  let totalPaper = 0;
  let totalMachine = 0;
  let totalElectors = 0;
  let riskScore = 0;
  let sectionCount = 0;

  cities.forEach((city) => {
    countries.add(city.countryName);
    total += city.total;
    voted += city.voted;
    discardedVotes += city.discardedVotes;
    noVotes += city.noVotes;
    totalPaper += city.totalPaper;
    totalMachine += city.totalMachine;
    totalElectors += city.totalElectors;
    riskScore += city.riskScore;
    sectionCount += city.sections.length;
    Object.entries(city.partyTotals).forEach(([partyId, votes]) => {
      partyTotals[partyId] = (partyTotals[partyId] || 0) + votes;
    });
  });

  const leadingParty = Object.entries(partyTotals)
    .map(([partyId, totalVotes]) => ({
      partyId,
      partyName: cities.find((city) => city.leadingParty?.partyId === partyId)?.leadingParty?.partyName || partyId,
      total: totalVotes,
    }))
    .sort(rankPartyLeaders)[0];

  return {
    label,
    countryCount: countries.size,
    cityCount: cities.length,
    sectionCount,
    voted,
    total,
    discardedVotes,
    noVotes,
    totalPaper,
    totalMachine,
    totalElectors,
    riskScore,
    partyTotals,
    leadingParty,
  };
}
