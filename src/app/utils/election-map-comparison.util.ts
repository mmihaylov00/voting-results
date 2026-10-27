import { Section } from '../models/election.models';
import { indexSections, matchHistoricalSection } from './election-comparison.util';
import { MapAggregate } from './map-metric.helper';

export interface MapComparison {
  date: string;
  sections: Section[];
  partyId: string | null;
}

const historicalIndexes = new WeakMap<Section[], ReturnType<typeof indexSections>>();

export function applyMapComparison<T extends MapAggregate>(
  aggregate: T,
  sections: Section[],
  comparisonSections: Section[] | null,
  currentPartyId: string | null,
  comparisonPartyId: string | null,
): T {
  let partyChangePp: number | null = null;
  if (comparisonSections && currentPartyId && comparisonPartyId && sections.length) {
    let index = historicalIndexes.get(comparisonSections);
    if (!index) {
      index = indexSections(comparisonSections);
      historicalIndexes.set(comparisonSections, index);
    }
    let currentVotes = 0;
    let previousVotes = 0;
    let currentVoted = 0;
    let previousVoted = 0;
    let complete = true;
    for (const section of sections) {
      const previous = matchHistoricalSection(section, index);
      if (!previous) {
        complete = false;
        break;
      }
      currentVotes += section.partyVotes[currentPartyId]?.total ?? 0;
      previousVotes += previous.partyVotes[comparisonPartyId]?.total ?? 0;
      currentVoted += section.voted;
      previousVoted += previous.voted;
    }
    if (complete && currentVoted > 0 && previousVoted > 0) {
      partyChangePp = (currentVotes / currentVoted - previousVotes / previousVoted) * 100;
    }
  }
  return { ...aggregate, partyChangePp };
}
