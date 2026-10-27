const PERSON_WORD = "[\\p{Lu}][\\p{Ll}]+(?:[-’'][\\p{Lu}][\\p{Ll}]+)*";
const PERSON_NAME = new RegExp(`^${PERSON_WORD}(?:\\s+${PERSON_WORD}){1,3}$`, 'u');
const PARTY_WORD = /(?:^|\s)(?:коалиция|партия|движение|българия|български|българска|демократична|промяната|съюз|ПП)(?:\s|$)/iu;

export function getPresidentialCandidateName(name: string | null | undefined): string {
  if (!name) return '';
  const candidates = name.trim().split(/\s+и\s+|\s*,\s*/u);
  if (candidates.length === 2 && candidates.every(candidate => PERSON_NAME.test(candidate) && !PARTY_WORD.test(candidate))) {
    return candidates[0];
  }
  return name;
}
