import { Section } from '../models/election.models';

export const ABROAD_REGION_ID = '32';

export function isAbroadSection(section: Pick<Section, 'regionId'> | null | undefined): boolean {
  return section?.regionId === ABROAD_REGION_ID;
}

export function splitAbroadLocation(cityName: string): { countryName: string; localityName: string } {
  const parts = cityName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { countryName: '', localityName: '' };
  }

  if (parts.length === 1) {
    return { countryName: parts[0], localityName: parts[0] };
  }

  return {
    countryName: parts[0],
    localityName: parts.slice(1).join(', '),
  };
}

export function normalizeAbroadSection(section: Section): Section {
  if (!isAbroadSection(section) || !section.cityName.includes(',')) {
    return section;
  }

  const { countryName, localityName } = splitAbroadLocation(section.cityName);

  return {
    ...section,
    municipalityName: section.municipalityName || countryName,
    cityName: localityName || section.cityName,
  };
}
