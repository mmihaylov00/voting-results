import { Section, SectionFilters } from '../models/election.models';

export function filterSections(sections: Section[], filters: SectionFilters): Section[] {
  let result = [...sections];

  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    result = result.filter(s =>
      s.sectionId.toLowerCase().includes(term) ||
      s.cityName.toLowerCase().includes(term) ||
      s.sectionName.toLowerCase().includes(term)
    );
  }

  const currentTab = filters.activeTab;
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
    result = result.filter(s => {
      // Activity > 50% and PP-DB is not first
      const isHighActivity = s.activityPercent > 0.5;
      const ppdbNotFirst = s.topParties.length === 0 || !s.topParties[0].name.includes('ПП-ДБ');
      return isHighActivity && ppdbNotFirst;
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

  return result;
}
