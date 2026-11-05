import { describe, expect, it } from 'vitest';
import { FACEBOOK_TONE_REVIEW_BATCH_SIZE, FacebookToneReviewDraft, FacebookToneReviewItem,
  matchingToneReviewDraft, toneReviewDraft, toneReviewSubmission, toneReviewKey, validToneReviewDrafts, validToneReviewReceipt } from './facebook-tone-review.util';

const item: FacebookToneReviewItem = {
  key: 'comment:post:a:2', kind: 'comment', postId: 'post:a', commentId: 2, parentId: 1,
  pageId: 'a', pageName: 'Страница', postUrl: 'https://www.facebook.com/a/posts/1/',
  postText: 'Публикация', text: 'Откъс от коментар.', parentText: 'Контекст.', truncated: false,
  gyurov: 'critical', yotova: 'not-mentioned', sourceSha256: 'b'.repeat(64), collectionSha256: 'a'.repeat(64),
};
const draft = (): FacebookToneReviewDraft => toneReviewDraft(item, { gyurov: 'neutral', yotova: 'supportive' });
const batchId = '11111111-1111-4111-8111-111111111111';

describe('Facebook tone suggestion boundaries', () => {
  it('uses post-local comment keys and retains source pins without source text or identity', () => {
    expect(toneReviewKey('post', 'post:a', null)).toBe('post:post:a');
    expect(toneReviewKey('comment', 'post:a', 2)).toBe(item.key);
    expect(validToneReviewDrafts({ version: 1, drafts: [draft()] })).toBe(true);
    expect(Object.keys(draft()).sort()).toEqual(['key', 'kind', 'postId', 'commentId', 'sourceSha256',
      'collectionSha256', 'originalGyurov', 'originalYotova', 'gyurov', 'yotova'].sort());
  });

  it('rejects unexpected fields, invalid enums, IDs, hashes, unchanged and duplicate suggestions', () => {
    const invalid: unknown[] = [
      { ...draft(), author: 'unexpected' }, { ...draft(), text: item.text }, { ...draft(), kind: 'page' },
      { ...draft(), gyurov: 'positive' }, { ...draft(), originalYotova: null },
      { ...draft(), commentId: 0 }, { ...draft(), commentId: 1.5 },
      { ...draft(), key: 'comment:another-post:2' }, { ...draft(), postId: 'bad\nidentifier' },
      { ...draft(), sourceSha256: 'B'.repeat(64) }, { ...draft(), collectionSha256: 'short' },
      { ...draft(), gyurov: item.gyurov, yotova: item.yotova },
      { ...draft(), key: 'post:post:a', kind: 'post', commentId: 2 },
    ];
    for (const value of invalid) expect(validToneReviewDrafts({ version: 1, drafts: [value] })).toBe(false);
    expect(validToneReviewDrafts({ version: 1, drafts: [draft(), draft()] })).toBe(false);
    expect(validToneReviewDrafts({ version: 2, drafts: [] })).toBe(false);
    expect(validToneReviewDrafts({ version: 1, drafts: [], extra: true })).toBe(false);
    expect(validToneReviewDrafts({ version: 1, drafts: Array(10001).fill(draft()) })).toBe(false);
  });

  it('requires the same source revision and baseline labels and excludes unpublished excerpts', () => {
    expect(matchingToneReviewDraft(item, draft())).toBe(true);
    for (const patch of [{ sourceSha256: 'c'.repeat(64) }, { collectionSha256: 'c'.repeat(64) },
      { originalGyurov: 'neutral' }, { originalYotova: 'critical' }, { commentId: 1 },
      { postId: 'another-post' }, { kind: 'post' }, { key: 'another-key' }]) {
      expect(matchingToneReviewDraft(item, { ...draft(), ...patch } as FacebookToneReviewDraft)).toBe(false);
    }
    expect(matchingToneReviewDraft({ ...item, text: null }, draft())).toBe(false);
    expect(matchingToneReviewDraft(item, undefined)).toBe(false);
  });

  it('creates the source-pinned JSON envelope without comment text or identity', () => {
    const body = toneReviewSubmission(batchId, [draft()]);
    expect(body).toEqual({ version: 1, batchId, changes: [draft()] });
    expect(Object.keys(body).sort()).toEqual(['version', 'batchId', 'changes'].sort());
    expect(JSON.stringify(body)).not.toContain(item.text!);
  });

  it('requires an exact receipt for the submitted batch and accepted count', () => {
    const receipt = { version: 1, batchId, accepted: 1 };
    expect(validToneReviewReceipt(receipt, batchId, 1)).toBe(true);
    for (const value of ['<app-root></app-root>', null, { ...receipt, extra: true },
      { ...receipt, version: 2 }, { ...receipt, batchId: 'another-batch' }, { ...receipt, accepted: 2 }]) {
      expect(validToneReviewReceipt(value, batchId, 1)).toBe(false);
    }
  });

  it('bounds batches and rejects invalid or empty payloads', () => {
    const values = Array.from({ length: FACEBOOK_TONE_REVIEW_BATCH_SIZE }, (_, index) =>
      ({ ...draft(), key: `comment:post:a:${index + 1}`, commentId: index + 1 }));
    expect(() => toneReviewSubmission(batchId, values)).not.toThrow();
    expect(() => toneReviewSubmission(batchId, [])).toThrow();
    expect(() => toneReviewSubmission('not-a-uuid', [draft()])).toThrow();
    expect(() => toneReviewSubmission('-'.repeat(36), [draft()])).toThrow();
    expect(() => toneReviewSubmission(batchId, [...values, { ...draft(), key: 'comment:post:a:101', commentId: 101 }])).toThrow();
  });
});
