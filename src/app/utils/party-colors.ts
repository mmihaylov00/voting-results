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
];

const DEFAULT_PARTY_COLOR = '#64748B'; // slate

export function getPartyColor(partyName: string | undefined | null): string {
  if (!partyName) return DEFAULT_PARTY_COLOR;
  const alias = getPartyAlias(partyName).toUpperCase();
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
