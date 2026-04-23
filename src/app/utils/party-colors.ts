import { getPartyAlias } from './party-aliases';

const PARTY_COLOR_RULES: { match: string[]; color: string }[] = [
  { match: ['ПП-ДБ', 'ПРОДЪЛЖАВАМЕ'], color: '#0015FF' }, // indigo
  { match: ['ГЕРБ'], color: '#0C4587' }, // blue
  { match: ['ВЪЗРАЖДАНЕ'], color: '#333333' }, // gold
  { match: ['ДПС'], color: '#217DDF' }, // blue
  { match: ['БСП'], color: '#ED1C24' }, // red
  { match: ['ИТН', 'ТАКЪВ НАРОД'], color: '#4BB9DE' }, // light blue
  { match: ['МЕЧ'], color: '#BE0034' }, // navy blue
  { match: ['ВЕЛИЧИЕ'], color: '#C13334' }, // red
  { match: ['АПС', 'АЛИАНС'], color: '#21A1DF' }, // red
  { match: ['ПБ', 'ПРОГРЕСИВНА'], color: '#024A3E' }, // dark green
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
