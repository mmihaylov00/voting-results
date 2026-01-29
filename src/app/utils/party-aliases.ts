/**
 * Maps party names to their aliases for display
 */
export function getPartyAlias(partyName: string): string {
  const n = partyName.toUpperCase();
  if (n.includes('ПРОДЪЛЖАВАМЕ')) return 'ПП-ДБ';
  if (n.includes('ГЕРБ')) return 'ГЕРБ-СДС';
  if (n.includes('ВЪЗРАЖДАНЕ')) return 'ВЪЗРАЖДАНЕ';
  if (n.includes('ДПС')) return 'ДПС';
  if (n.includes('БСП')) return 'БСП';
  if (n.includes('ТАКЪВ НАРОД')) return 'ИТН';
  if (n.includes('ВЕЛИЧИЕ')) return 'ВЕЛИЧИЕ';
  if (n.includes('МЕЧ')) return 'МЕЧ';
  return partyName;
}
