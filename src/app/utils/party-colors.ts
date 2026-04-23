import { getPartyAlias } from './party-aliases';

const PARTY_COLOR_RULES: { match: string[]; color: string }[] = [
  { match: ['ПП-ДБ', 'ПРОДЪЛЖАВАМЕ'], color: '#0015FF' },
  { match: ['ГЕРБ'], color: '#0C4587' },
  { match: ['ВЪЗРАЖДАНЕ'], color: '#57a561' },
  { match: ['ДПС'], color: '#217DDF' },
  { match: ['БСП'], color: '#ED1C24' },
  { match: ['ИТН', 'ТАКЪВ НАРОД'], color: '#4BB9DE' },
  { match: ['МЕЧ'], color: '#BE0034' },
  { match: ['ВЕЛИЧИЕ'], color: '#C13334' },
  { match: ['АПС', 'АЛИАНС'], color: '#21A1DF' },
  { match: ['ПБ', 'ПРОГРЕСИВНА'], color: '#037260' },
];

const DARK_PARTY_COLOR_OVERRIDES: { match: string[]; color: string }[] = [
  { match: ['ПП-ДБ', 'ПРОДЪЛЖАВАМЕ'], color: '#5B7CFF' },
  { match: ['ГЕРБ'], color: '#3BC5E0' },
  { match: ['ВЪЗРАЖДАНЕ'], color: '#F5C542' },
];

const DEFAULT_PARTY_COLOR = '#64748B'; // slate

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
