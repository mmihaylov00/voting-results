import images from '../../assets/contestant-images.json';
import { matchContestantId } from './contestant-profile.util';
import { ElectionType } from './election-type';

export function getContestantImage(name: string, type: ElectionType) {
  const candidates = images.filter(image => image.type === type);
  const exact = candidates.find(image => image.names.includes(name));
  if (exact) return exact;
  const matches = candidates.filter(image => image.names.some(alias =>
    matchContestantId(name, { image: alias }, type) === 'image'));
  return matches.length === 1 ? matches[0] : null;
}
