import { getPartyAlias } from './party-aliases';
import { getPresidentialCandidateName } from './candidate-label';

const PARTY_COLOR_RULES: { match: string[]; color: string }[] = [
  { match: ['ПП-ДБ', 'ПРОДЪЛЖАВАМЕ'], color: '#0015FF' },
  { match: ['ПБ', 'ПРОГРЕСИВНА'], color: '#037260' },
  { match: ['ГЕРБ'], color: '#2268ba' },
  { match: ['ВЪЗРАЖДАНЕ'], color: '#57a561' },
  { match: ['ДПС'], color: '#063873' },
  { match: ['БСП'], color: '#ED1C24' },
  { match: ['ИТН', 'ТАКЪВ НАРОД'], color: '#4BB9DE' },
  { match: ['МЕЧ'], color: '#8a0027' },
  { match: ['ВЕЛИЧИЕ'], color: '#b13e3e' },
  { match: ['АПС', 'АЛИАНС'], color: '#add8ed' },
];

const DARK_PARTY_COLOR_OVERRIDES: { match: string[]; color: string }[] = [
  { match: ['ГЕРБ'], color: '#3BC5E0' },
  { match: ['ДПС'], color: '#0555b8' },
  { match: ['ПБ', 'ПРОГРЕСИВНА'], color: '#1caa93' },
  { match: ['ПП-ДБ', 'ПРОДЪЛЖАВАМЕ'], color: '#F5C542' },
];

const DEFAULT_PARTY_COLOR = '#64748B';

function isOthersParty(name: string | undefined | null): boolean {
  return name?.trim().toLocaleUpperCase('bg') === 'ДРУГИ';
}

export function getPartyColor(partyName: string | undefined | null, isDark = false): string {
  if (!partyName) return DEFAULT_PARTY_COLOR;
  if (isOthersParty(partyName)) return isDark ? '#CBD5E1' : '#0F172A';
  const candidate = getPresidentialCandidateName(partyName).toLocaleUpperCase('bg').trim().split(/\s+/);
  let colorName = partyName;
  if ((candidate[0] === 'РУМЕН' && candidate.includes('РАДЕВ')) || (candidate[0] === 'ИЛИЯНА' && candidate.includes('ЙОТОВА'))) {
    colorName = 'ПРОГРЕСИВНА БЪЛГАРИЯ';
  } else if ((['АНАСТАС', 'АТАНАС'].includes(candidate[0]) && candidate.includes('ГЕРДЖИКОВ'))
    || (candidate[0] === 'ЦЕЦКА' && candidate.includes('ЦАЧЕВА'))) {
    colorName = 'ГЕРБ';
  } else if (candidate[0] === 'МУСТАФА' && candidate.includes('КАРАДАЙЪ')) {
    colorName = 'ДПС';
  } else if (candidate[0] === 'АНДРЕЙ' && candidate.includes('ГЮРОВ')) {
    colorName = 'ПРОДЪЛЖАВАМЕ ПРОМЯНАТА';
  } else if (candidate[0] === 'КОСТАДИН' && candidate.includes('КОСТАДИНОВ')) {
    colorName = 'ВЪЗРАЖДАНЕ';
  } else if (candidate[0] === 'ИВЕЛИН' && candidate.includes('МИХАЙЛОВ')) {
    colorName = 'ВЕЛИЧИЕ';
  } else if (candidate[0] === 'РАДОСТИН' && candidate.includes('ВАСИЛЕВ')) {
    colorName = 'МЕЧ';
  }
  const alias = getPartyAlias(colorName).toUpperCase();
  if (isDark) {
    for (const rule of DARK_PARTY_COLOR_OVERRIDES) {
      if (rule.match.some(key => alias.includes(key))) {
        return rule.color;
      }
    }
  }
  for (const rule of PARTY_COLOR_RULES) {
    if (rule.match.some(key => alias.includes(key))) {
      return rule.color;
    }
  }
  return DEFAULT_PARTY_COLOR;
}

export function getPartyLegendIndex(partyName: string | undefined | null): number {
  if (isOthersParty(partyName)) return 2;
  return getPartyColor(partyName) === DEFAULT_PARTY_COLOR ? 1 : 0;
}

export function getPartyBadgeLabel(partyName: string | undefined | null): string {
  return getPartyDisplayName(partyName);
}

export function getPartyDisplayName(partyName: string | undefined | null): string {
  if (!partyName) return '';
  const candidate = getPresidentialCandidateName(partyName);
  return candidate === partyName ? getPartyAlias(partyName) : candidate;
}
