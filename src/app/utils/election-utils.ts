import { Section, SectionFilters } from '../models/election.models';

export function filterSections(sections: Section[], filters: SectionFilters): Section[] {
  let result = [...sections];

  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    result = result.filter(s => {
      const matchesSectionId = s.sectionId.toLowerCase().includes(term);
      const matchesCityName = s.cityName.toLowerCase().includes(term);
      const matchesSectionName = s.sectionName.toLowerCase().includes(term);
      const matchesRegionName = filters.isViewingAllSections && s.regionName && s.regionName.toLowerCase().includes(term);
      return matchesSectionId || matchesCityName || matchesSectionName || matchesRegionName;
    });
  }

  const currentTab = filters.activeTab;

  // Calculate votesToFirst for all sections if relevant
  result.forEach(s => {
    if (s.topParties.length > 0) {
      const isFirst = s.topParties[0].name.includes('ПП-ДБ');
      const ppdb = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));

      if (isFirst) {
        s.votesToFirst = 0;
      } else if (ppdb) {
        s.votesToFirst = (s.topParties[0].total - ppdb.total) + 1;
      } else {
        // Not in top 3, we'd need to find it in all party votes
        // Search partyVotes for the partyId that was used for PP-DB in other sections
        // But we don't have the partyId here easily.
        // Let's look for any section that HAS PP-DB in topParties to get its partyId
        const ppdbInAny = sections.find(sec => sec.topParties.some(tp => tp.name.includes('ПП-ДБ')));
        const ppdbId = ppdbInAny?.topParties.find(tp => tp.name.includes('ПП-ДБ'))?.partyId;

        if (ppdbId && s.partyVotes[ppdbId]) {
          s.votesToFirst = (s.topParties[0].total - s.partyVotes[ppdbId].total) + 1;
        } else {
          s.votesToFirst = undefined;
        }
      }
    }
  });

  if (currentTab === 'outside') {
    result = result.filter(s => {
      // "ПП-ДБ" is not in top 3
      return !s.topParties.some(tp => tp.name.includes('ПП-ДБ'));
    });
  } else if (currentTab === 'target') {
    result = result.filter(s => {
      // "ПП-ДБ" is first
      return s.topParties.length > 0 && s.topParties[0].name.includes('ПП-ДБ');
    });
  } else if (currentTab === 'swing') {
    result = result.filter(s => {
      // difference between ПП and the first party is less than 5%
      if (s.topParties.length === 0) return false;

      const firstParty = s.topParties[0];
      const ppdb = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));

      if (!ppdb) return false;
      if (firstParty.name.includes('ПП-ДБ')) return false; // Already in 'target'

      const diff = firstParty.percent - ppdb.percent;
      return diff < 0.05;
    });
  } else if (currentTab === 'declining') {
    result = result.filter(s => {
      // Votes for ПП-ДБ in the selected election are less than the ones in the previous election
      const ppdbInTop = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));

      // s.topParties[].comparisons contains historical data
      if (ppdbInTop && ppdbInTop.comparisons && ppdbInTop.comparisons.length > 0) {
          const previousVotes = ppdbInTop.comparisons[0].value;
          return ppdbInTop.total < previousVotes;
      }

      return false;
    });
  } else if (currentTab === 'risky') {
    result = result.filter(s => (s.riskScore || 0) > 0);
  } else if (currentTab === 'dormant') {
    result = result.filter(s => {
      const ppdb = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));
      if (!ppdb) return false;
      return ppdb.percent > 0.30 && s.activityPercent < (s.municipalityAvgTurnout || 0);
    });
  } else if (currentTab === 'flip') {
    result = result.filter(s => {
      return s.votesToFirst !== undefined && s.votesToFirst > 0;
    });
  } else if (currentTab === 'vanishing') {
    result = result.filter(s => {
      const ppdb = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));
      if (ppdb && ppdb.comparisons && ppdb.comparisons.length > 0) {
        const currentVotes = ppdb.total;
        const previousVotes = ppdb.comparisons[0].value;
        if (previousVotes > 0) {
          const drop = (previousVotes - currentVotes) / previousVotes;
          return drop > 0.40;
        }
      }
      return false;
    });
  }

  if (filters.lowActivityThreshold !== null) {
    const threshold = Math.min(100, Math.max(0, filters.lowActivityThreshold));
    if (filters.activityOperator === 'lte') {
      result = result.filter(s => Math.min(100, Math.max(0, s.activityPercent * 100)) <= threshold);
    } else {
      result = result.filter(s => Math.min(100, Math.max(0, s.activityPercent * 100)) >= threshold);
    }
  }

  if (filters.sectionTypes && filters.sectionTypes.size > 0) {
    result = result.filter(s => filters.sectionTypes.has(s.sectionType));
  }

  // Risk filters
  if (filters.riskFilterType === 'any') {
    result = result.filter(s => {
      const hasRiskIndicators = s.riskIndicators && s.riskIndicators.length > 0;
      const hasRiskScore = (s.riskScore || 0) > 0;
      return hasRiskIndicators || hasRiskScore;
    });
  } else if (filters.riskFilterType === 'none') {
    result = result.filter(s => {
      const hasRiskIndicators = s.riskIndicators && s.riskIndicators.length > 0;
      const hasRiskScore = (s.riskScore || 0) > 0;
      return !hasRiskIndicators && !hasRiskScore;
    });
  }

  // Filter by risk categories (R1, R2, R3, R4)
  if (filters.selectedRiskCategories && filters.selectedRiskCategories.size > 0) {
    result = result.filter(s => {
      if (!s.riskIndicators || s.riskIndicators.length === 0) return false;

      const sectionCategories = new Set(s.riskIndicators.map(ri => ri.category));
      // Check if section has at least one of the selected categories
      return Array.from(filters.selectedRiskCategories || []).some(cat => sectionCategories.has(cat));
    });
  }

  return result;
}
