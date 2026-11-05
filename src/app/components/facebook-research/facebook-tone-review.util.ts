import { FacebookCandidate, FacebookStanceLabel } from './facebook-research.models';
import { FACEBOOK_STANCE_BUCKETS } from './facebook-research.util';

export interface FacebookToneReviewItem {
  key: string;
  kind: 'post' | 'comment';
  postId: string;
  commentId: number | null;
  parentId: number | null;
  pageId: string;
  pageName: string;
  postUrl: string;
  postText: string;
  text: string | null;
  parentText: string | null;
  truncated: boolean;
  gyurov: FacebookStanceLabel;
  yotova: FacebookStanceLabel;
  sourceSha256: string;
  collectionSha256: string;
}

export interface FacebookToneReviewDraft {
  key: string;
  kind: 'post' | 'comment';
  postId: string;
  commentId: number | null;
  sourceSha256: string;
  collectionSha256: string;
  originalGyurov: FacebookStanceLabel;
  originalYotova: FacebookStanceLabel;
  gyurov: FacebookStanceLabel;
  yotova: FacebookStanceLabel;
}

export const FACEBOOK_TONE_REVIEW_BATCH_SIZE = 100;
export const FACEBOOK_TONE_REVIEW_STORAGE = 'facebook-tone-review-drafts-v1';

export const toneReviewKey = (kind: 'post' | 'comment', postId: string, commentId: number | null) =>
  kind === 'post' ? `post:${postId}` : `comment:${postId}:${commentId}`;

export function validReviewTone(value: unknown): value is FacebookStanceLabel {
  return FACEBOOK_STANCE_BUCKETS.some(tone => tone === value);
}

export function toneReviewDraft(item: FacebookToneReviewItem,
  tones: Record<FacebookCandidate, FacebookStanceLabel>): FacebookToneReviewDraft {
  return {
    key: item.key, kind: item.kind, postId: item.postId, commentId: item.commentId,
    sourceSha256: item.sourceSha256, collectionSha256: item.collectionSha256,
    originalGyurov: item.gyurov, originalYotova: item.yotova, ...tones,
  };
}

const fields = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function validToneReviewDrafts(value: unknown): value is { version: 1; drafts: FacebookToneReviewDraft[] } {
  if (!fields(value, ['version', 'drafts']) || value['version'] !== 1
    || !Array.isArray(value['drafts']) || value['drafts'].length > 10000) return false;
  const keys = new Set<string>();
  for (const draft of value['drafts']) {
    if (!fields(draft, ['key', 'kind', 'postId', 'commentId', 'sourceSha256', 'collectionSha256',
      'originalGyurov', 'originalYotova', 'gyurov', 'yotova'])
      || !['post', 'comment'].includes(String(draft['kind']))
      || typeof draft['postId'] !== 'string' || !draft['postId'].trim() || draft['postId'].length > 512
      || /[\u0000-\u001f]/.test(draft['postId'])
      || (draft['kind'] === 'post' ? draft['commentId'] !== null
        : typeof draft['commentId'] !== 'number' || !Number.isSafeInteger(draft['commentId']) || draft['commentId'] <= 0)
      || draft['key'] !== toneReviewKey(draft['kind'] as 'post' | 'comment', draft['postId'], draft['commentId'] as number | null)
      || keys.has(draft['key'] as string) || !hash(draft['sourceSha256']) || !hash(draft['collectionSha256'])
      || !['originalGyurov', 'originalYotova', 'gyurov', 'yotova'].every(key => validReviewTone(draft[key]))
      || draft['gyurov'] === draft['originalGyurov'] && draft['yotova'] === draft['originalYotova']) return false;
    keys.add(draft['key'] as string);
  }
  return true;
}

export function matchingToneReviewDraft(item: FacebookToneReviewItem, draft: FacebookToneReviewDraft | undefined): boolean {
  return !!draft && item.text !== null && draft.key === item.key && draft.kind === item.kind
    && draft.postId === item.postId && draft.commentId === item.commentId
    && draft.sourceSha256 === item.sourceSha256 && draft.collectionSha256 === item.collectionSha256
    && draft.originalGyurov === item.gyurov && draft.originalYotova === item.yotova;
}

export function toneReviewSubmission(batchId: string, drafts: FacebookToneReviewDraft[]) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(batchId) || !drafts.length || drafts.length > FACEBOOK_TONE_REVIEW_BATCH_SIZE
    || !validToneReviewDrafts({ version: 1, drafts })) throw new Error('Invalid tone suggestions');
  return { version: 1, batchId, changes: drafts };
}

export function validToneReviewReceipt(value: unknown, batchId: string, accepted: number): boolean {
  return fields(value, ['version', 'batchId', 'accepted']) && value['version'] === 1
    && value['batchId'] === batchId && value['accepted'] === accepted;
}
