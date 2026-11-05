import { FacebookCandidate, FacebookCommentCounts, FacebookStanceLabel } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_STANCE_BUCKETS } from './facebook-research.util';

export interface FacebookCommentReaderEntry {
  postId: string;
  file: string;
  count: number;
}

export interface FacebookCommentReaderManifest {
  version: 1;
  collectionSha256: string;
  posts: FacebookCommentReaderEntry[];
}

export interface FacebookCommentExcerpt {
  id: number;
  parentId: number | null;
  text: string | null;
  truncated: boolean;
  gyurov: FacebookStanceLabel;
  yotova: FacebookStanceLabel;
}

export interface FacebookCommentReaderReport {
  version: 1;
  collectionSha256: string;
  postId: string;
  comments: FacebookCommentExcerpt[];
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const tone = (value: unknown): value is FacebookStanceLabel => FACEBOOK_STANCE_BUCKETS.some(bucket => bucket === value);

export function validFacebookCommentReaderManifest(value: unknown, collectionSha256: string): value is FacebookCommentReaderManifest {
  if (!fields(value, ['version', 'collectionSha256', 'posts']) || value['version'] !== 1
    || !/^[a-f0-9]{64}$/.test(collectionSha256) || value['collectionSha256'] !== collectionSha256
    || !Array.isArray(value['posts'])) return false;
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const post of value['posts']) {
    if (!fields(post, ['postId', 'file', 'count']) || typeof post['postId'] !== 'string' || !post['postId'].trim()
      || ids.has(post['postId']) || typeof post['file'] !== 'string' || !/^[a-f0-9]{64}\.json$/.test(post['file'])
      || files.has(post['file']) || !count(post['count'])) return false;
    ids.add(post['postId']);
    files.add(post['file']);
  }
  return true;
}

/** Accept only snapshot-local comment numbers and the approved excerpt fields. */
export function validFacebookCommentReaderReport(value: unknown, entry: FacebookCommentReaderEntry,
  collectionSha256: string, expectedCounts: Record<FacebookCandidate, FacebookCommentCounts>): value is FacebookCommentReaderReport {
  if (!fields(value, ['version', 'collectionSha256', 'postId', 'comments']) || value['version'] !== 1
    || value['collectionSha256'] !== collectionSha256 || value['postId'] !== entry.postId
    || !Array.isArray(value['comments']) || value['comments'].length !== entry.count) return false;
  const comments = value['comments'];
  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    if (!fields(comment, ['id', 'parentId', 'text', 'truncated', 'gyurov', 'yotova'])
      || comment['id'] !== index + 1
      || !(comment['parentId'] === null || count(comment['parentId']) && comment['parentId'] > 0
        && comment['parentId'] <= entry.count && comment['parentId'] !== comment['id'])
      || !(comment['text'] === null || typeof comment['text'] === 'string'
        && comment['text'].trim().length > 0 && Array.from(comment['text']).length <= 280)
      || typeof comment['truncated'] !== 'boolean'
      || !tone(comment['gyurov']) || !tone(comment['yotova'])
      || (comment['gyurov'] === 'unreviewed') !== (comment['yotova'] === 'unreviewed')) return false;
  }
  return comments.every(comment => comment['parentId'] === null
    || comments[comment['parentId'] - 1]['parentId'] === null)
    && FACEBOOK_CANDIDATES.every(candidate => FACEBOOK_STANCE_BUCKETS.every(bucket =>
      comments.filter(comment => comment[candidate] === bucket).length === expectedCounts[candidate][bucket]));
}
