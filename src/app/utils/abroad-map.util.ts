import { Section } from '../models/election.models';

export type AbroadContinentId =
  | 'europe'
  | 'asia'
  | 'africa'
  | 'north-america'
  | 'south-america'
  | 'oceania';

export interface AbroadContinentDefinition {
  id: AbroadContinentId;
  label: string;
  center: [number, number];
}

export interface AbroadPartyLeader {
  partyId: string;
  partyName: string;
  total: number;
}

export interface AbroadContinentAggregate extends AbroadContinentDefinition {
  sections: Section[];
  countries: string[];
  cities: string[];
  total: number;
  voted: number;
  discardedVotes: number;
  noVotes: number;
  partyTotals: Record<string, number>;
  leadingParty?: AbroadPartyLeader;
}

export const ABROAD_CONTINENTS: AbroadContinentDefinition[] = [
  { id: 'europe', label: 'Европа', center: [54, 18] },
  { id: 'asia', label: 'Азия', center: [34, 95] },
  { id: 'africa', label: 'Африка', center: [2, 20] },
  { id: 'north-america', label: 'Северна Америка', center: [42, -98] },
  { id: 'south-america', label: 'Южна Америка', center: [-18, -60] },
  { id: 'oceania', label: 'Австралия и Океания', center: [-24, 134] },
];

const COUNTRY_TO_CONTINENT: Record<string, AbroadContinentId> = {
  'австралия': 'oceania',
  'австрия': 'europe',
  'азербайджан': 'asia',
  'албания': 'europe',
  'алжир': 'africa',
  'аржентина': 'south-america',
  'армения': 'asia',
  'беларус': 'europe',
  'белгия': 'europe',
  'босна и херцеговина': 'europe',
  'бразилия': 'south-america',
  'германия': 'europe',
  'германия фр': 'europe',
  'грузия': 'asia',
  'гърция': 'europe',
  'дания': 'europe',
  'египет': 'africa',
  'ирландия': 'europe',
  'исландия': 'europe',
  'испания': 'europe',
  'италия': 'europe',
  'канада': 'north-america',
  'кипър': 'asia',
  'китай': 'asia',
  'косово': 'europe',
  'люксембург': 'europe',
  'малта': 'europe',
  'мароко': 'africa',
  'молдова': 'europe',
  'нидерландия': 'europe',
  'нова зеландия': 'oceania',
  'норвегия': 'europe',
  'обединено кралство': 'europe',
  'полша': 'europe',
  'португалия': 'europe',
  'република корея': 'asia',
  'румъния': 'europe',
  'русия': 'europe',
  'северна македония': 'europe',
  'сингапур': 'asia',
  'словакия': 'europe',
  'словения': 'europe',
  'сърбия': 'europe',
  'сащ': 'north-america',
  'тунис': 'africa',
  'турция': 'asia',
  'унгария': 'europe',
  'финландия': 'europe',
  'франция': 'europe',
  'хърватия': 'europe',
  'черна гора': 'europe',
  'чехия': 'europe',
  'швейцария': 'europe',
  'швеция': 'europe',
  'южна африка': 'africa',
  'република южна африка': 'africa',
  'япония': 'asia',
};

function normalizeCountryName(country: string): string {
  return country.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rankPartyLeaders(a: AbroadPartyLeader, b: AbroadPartyLeader): number {
  return b.total - a.total
    || a.partyName.localeCompare(b.partyName, 'bg')
    || a.partyId.localeCompare(b.partyId, 'bg');
}

export function getAbroadCountryName(cityName: string): string {
  return cityName.split(',')[0]?.trim() || cityName.trim();
}

export function getAbroadContinentId(cityName: string): AbroadContinentId | null {
  const country = normalizeCountryName(getAbroadCountryName(cityName));
  return COUNTRY_TO_CONTINENT[country] || null;
}

export function aggregateAbroadSectionsByContinent(
  sections: Section[],
  partiesById: Record<string, string>
): AbroadContinentAggregate[] {
  const definitionsById = new Map(ABROAD_CONTINENTS.map((continent) => [continent.id, continent]));
  const groups = new Map<AbroadContinentId, AbroadContinentAggregate>();

  for (const section of sections) {
    if (section.regionId !== '32') {
      continue;
    }

    const continentId = getAbroadContinentId(section.cityName);
    if (!continentId) {
      continue;
    }

    const definition = definitionsById.get(continentId);
    if (!definition) {
      continue;
    }

    let aggregate = groups.get(continentId);
    if (!aggregate) {
      aggregate = {
        ...definition,
        sections: [],
        countries: [],
        cities: [],
        total: 0,
        voted: 0,
        discardedVotes: 0,
        noVotes: 0,
        partyTotals: Object.create(null),
      };
      groups.set(continentId, aggregate);
    }

    const country = getAbroadCountryName(section.cityName);
    if (!aggregate.countries.includes(country)) {
      aggregate.countries.push(country);
    }
    if (!aggregate.cities.includes(section.cityName)) {
      aggregate.cities.push(section.cityName);
    }

    aggregate.sections.push(section);
    aggregate.total += section.total || 0;
    aggregate.voted += section.voted || 0;
    aggregate.discardedVotes += section.discardedVotes || 0;
    aggregate.noVotes += section.noVotes || 0;

    Object.entries(section.partyVotes || {}).forEach(([partyId, votes]) => {
      aggregate!.partyTotals[partyId] = (aggregate!.partyTotals[partyId] || 0) + (votes.total || 0);
    });
  }

  return ABROAD_CONTINENTS.map((continent) => {
    const aggregate = groups.get(continent.id);
    if (!aggregate) {
      return {
        ...continent,
        sections: [],
        countries: [],
        cities: [],
        total: 0,
        voted: 0,
        discardedVotes: 0,
        noVotes: 0,
        partyTotals: Object.create(null),
      };
    }

    const partyLeaders = Object.entries(aggregate.partyTotals)
      .map(([partyId, total]) => ({
        partyId,
        partyName: partiesById[partyId] || partyId,
        total,
      }))
      .sort(rankPartyLeaders);

    return {
      ...aggregate,
      countries: [...aggregate.countries].sort((a, b) => a.localeCompare(b, 'bg')),
      cities: [...aggregate.cities].sort((a, b) => a.localeCompare(b, 'bg')),
      leadingParty: partyLeaders[0],
    };
  });
}
