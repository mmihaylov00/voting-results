import { FacebookCandidate, FacebookCommentCoverage, FacebookCommentsReport, FacebookPage, FacebookPost } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_STANCE_BUCKETS } from './facebook-research.util';

export interface FacebookCommentRow extends FacebookCommentCoverage {
  post: FacebookPost;
  page: FacebookPage;
}

export const FACEBOOK_COMMENT_COVERAGE_LABELS = {
  'not-checked': 'Необходена', partial: 'Частична', complete: 'Обходена', unavailable: 'Недостъпна',
};

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Validate coverage before displaying a missing thread as an observed zero. */
export function validFacebookCommentsReport(value: unknown, posts: readonly FacebookPost[]): value is FacebookCommentsReport {
  if (!object(value) || value['version'] !== 1 || !timestamp(value['capturedAt'])
    || typeof value['collectionSha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['collectionSha256'])
    || !Array.isArray(value['posts']) || value['posts'].length !== posts.length) return false;
  const ids = new Set(posts.map(post => post.id));
  for (const row of value['posts']) {
    if (!object(row) || typeof row['postId'] !== 'string' || !ids.delete(row['postId'])
      || typeof row['status'] !== 'string' || !Object.hasOwn(FACEBOOK_COMMENT_COVERAGE_LABELS, row['status'])
      || !['all', 'newest', 'most-relevant', null].includes(row['ordering'] as string | null)
      || !(row['reportedCount'] === null || count(row['reportedCount']))
      || !['capturedCount', 'assessedCount', 'topLevelCount', 'replyCount'].every(key => count(row[key]))
      || !Array.isArray(row['notes']) || !row['notes'].every(note => typeof note === 'string')
      || !object(row['counts'])) return false;
    const captured = row['capturedCount'] as number;
    const assessed = row['assessedCount'] as number;
    if (assessed > captured || (row['topLevelCount'] as number) + (row['replyCount'] as number) !== captured
      || (row['status'] === 'not-checked' ? row['checkedAt'] !== null || row['ordering'] !== null
        || row['reportedCount'] !== null || captured !== 0 : !timestamp(row['checkedAt']))
      || row['status'] === 'unavailable' && captured !== 0) return false;
    for (const candidate of FACEBOOK_CANDIDATES) {
      const counts = row['counts'][candidate];
      if (!object(counts) || !FACEBOOK_STANCE_BUCKETS.every(bucket => count(counts[bucket]))
        || FACEBOOK_STANCE_BUCKETS.reduce((sum, bucket) => sum + (counts[bucket] as number), 0) !== captured
        || counts['unreviewed'] !== captured - assessed) return false;
    }
  }
  return ids.size === 0;
}

export function facebookCommentPageCounts(rows: readonly FacebookCommentRow[], candidate: FacebookCandidate) {
  const pages = new Map<string, { id: string; name: string; supportive: number; critical: number }>();
  for (const row of rows) {
    const page = pages.get(row.page.id) ?? { id: row.page.id, name: row.page.name, supportive: 0, critical: 0 };
    page.supportive += row.counts[candidate].supportive;
    page.critical += row.counts[candidate].critical;
    pages.set(page.id, page);
  }
  return [...pages.values()].filter(page => page.supportive + page.critical > 0)
    .sort((left, right) => right.supportive + right.critical - left.supportive - left.critical);
}

export function facebookCommentTotals(rows: readonly FacebookCommentRow[]) {
  return rows.reduce((sum, row) => ({
    captured: sum.captured + row.capturedCount,
    assessed: sum.assessed + row.assessedCount,
    checked: sum.checked + Number(row.status !== 'not-checked'),
    reported: sum.reported + (row.reportedCount ?? 0),
    reportedPosts: sum.reportedPosts + Number(row.reportedCount !== null),
  }), { captured: 0, assessed: 0, checked: 0, reported: 0, reportedPosts: 0 });
}
