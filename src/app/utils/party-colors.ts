import { getPartyAlias } from './party-aliases';

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

export function getPartyColor(partyName: string | undefined | null, isDark = false): string {
  if (!partyName) return DEFAULT_PARTY_COLOR;
  const alias = getPartyAlias(partyName).toUpperCase();
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

export function getPartyBadgeLabel(partyName: string | undefined | null): string {
  if (!partyName) return '';
  return getPartyAlias(partyName);
}
