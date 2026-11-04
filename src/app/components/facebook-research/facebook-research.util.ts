import { FacebookImage, FacebookMetric, FacebookPageSummary, FacebookPost, FacebookReport, FacebookTotal } from './facebook-research.models';

export const FACEBOOK_METRICS: readonly FacebookMetric[] = ['reactions', 'comments', 'shares'];
export const FACEBOOK_METRIC_LABELS: Record<FacebookMetric, string> = {
  reactions: 'Реакции', comments: 'Коментари', shares: 'Споделяния',
};

export function facebookTotal(posts: readonly FacebookPost[], metric: FacebookMetric): FacebookTotal {
  const known = posts.map(post => post.metrics[metric]).filter(counter => counter.value !== null);
  return {
    value: known.length ? known.reduce((sum, counter) => sum + counter.value!, 0) : null,
    approximate: known.some(counter => counter.approximate === true),
    missing: posts.length - known.length,
  };
}

export function facebookPageSummaries(report: FacebookReport): FacebookPageSummary[] {
  return report.pages.map(page => {
    const posts = report.posts.filter(post => post.pageId === page.id);
    return {
      ...page, postCount: posts.length,
      collectionPosts: posts.filter(post => post.origin === 'collection').length,
      totals: {
        reactions: facebookTotal(posts, 'reactions'), comments: facebookTotal(posts, 'comments'),
        shares: facebookTotal(posts, 'shares'),
      },
    };
  });
}

export function facebookDailyCounts(posts: readonly FacebookPost[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (post.date) counts.set(post.date, (counts.get(post.date) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([date, count]) => ({ date, count }));
}

export function facebookCount(value: number | null, approximate = false): string {
  return value === null ? '—' : `${approximate ? '≈ ' : ''}${value.toLocaleString('bg-BG')}`;
}

export function facebookDate(post: FacebookPost): string {
  if (post.date) return formatDate(post.date);
  return post.interval ? `${formatDate(post.interval.start)} - ${formatDate(post.interval.end)}` : 'Няма дата';
}

export function facebookTime(post: FacebookPost): string {
  return post.publishedAt ? new Intl.DateTimeFormat('bg-BG', {
    timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(post.publishedAt)) : '';
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('bg-BG', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export function facebookShortName(name: string): string {
  return name.replace(/^Информационна агенция\s+/, '');
}

/** Validate published files before the view reads references or renders external links. */
export function validFacebookReport(report: FacebookReport): boolean {
  if (report?.version !== 1 || !Array.isArray(report.pages) || !Array.isArray(report.posts)
    || !Array.isArray(report.matches) || !Array.isArray(report.coverage) || !Array.isArray(report.reviews)) return false;
  if (!report.pages.every(page => page && typeof page.id === 'string')
    || !report.posts.every(post => post && typeof post.id === 'string')
    || !report.matches.every(Boolean) || !report.coverage.every(Boolean) || !report.reviews.every(Boolean)) return false;
  const safeFacebookUrl = (value: string): boolean => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.facebook.com'; }
    catch { return false; }
  };
  const pages = new Set(report.pages.map(page => page.id));
  const posts = new Set(report.posts.map(post => post.id));
  const octoberDate = (value: string): boolean => typeof value === 'string' && /^2026-10-(0[1-9]|[12]\d|3[01])$/.test(value);
  const validImage = (image: FacebookImage, sourceUrl: string): boolean => !!image
    && typeof image.sha256 === 'string' && /^[a-f0-9]{64}$/.test(image.sha256)
    && new RegExp(`^/images/facebook/2026/${image.sha256}\\.(jpg|avif)$`).test(image.src)
    && image.sourceUrl === sourceUrl && safeFacebookUrl(image.sourceUrl)
    && Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0
    && (image.kind === 'image' || image.kind === 'video-thumbnail') && Number.isFinite(Date.parse(image.capturedAt));
  return report.period === '2026-10' && Number.isInteger(report.keywordTarget) && report.keywordTarget > 0
    && Number.isFinite(Date.parse(report.collectionDate))
    && report.collectionPostCount === report.posts.filter(post => post.origin === 'collection').length
    && pages.size === report.pages.length && posts.size === report.posts.length
    && report.pages.every(page => typeof page.name === 'string' && safeFacebookUrl(page.url)
      && (page.avatar === undefined || validImage(page.avatar, page.url) && page.avatar.kind === 'image'))
    && report.posts.every(post => pages.has(post.pageId) && safeFacebookUrl(post.url)
      && typeof post.excerpt === 'string' && typeof post.summary === 'string' && Array.isArray(post.keywords)
      && post.keywords.every(match => match && typeof match.keyword === 'string')
      && (!post.publishedAt || Number.isFinite(Date.parse(post.publishedAt)))
      && Number.isFinite(Date.parse(post.collectedAt))
      && (post.images === undefined || Array.isArray(post.images) && post.images.every(image => validImage(image, post.url)))
      && (post.origin === 'collection' || post.origin === 'discovery')
      && (post.date ? octoberDate(post.date) : !!post.interval && octoberDate(post.interval.start)
        && octoberDate(post.interval.end) && post.interval.start <= post.interval.end)
      && FACEBOOK_METRICS.every(metric => post.metrics?.[metric]
        && (post.metrics[metric].value === null || Number.isFinite(post.metrics[metric].value) && post.metrics[metric].value! >= 0)))
    && report.matches.every(match => posts.has(match.sourceId) && posts.has(match.targetId)
      && match.sourceId !== match.targetId && (match.kind === 'body' || match.kind === 'headline') && Number.isFinite(match.delayMinutes))
    && report.coverage.every(row => typeof row.keyword === 'string' && Number.isInteger(row.count) && row.count >= 0)
    && report.reviews.every(review => typeof review.title === 'string' && typeof review.summary === 'string'
      && Array.isArray(review.checks) && Array.isArray(review.alternatives) && Array.isArray(review.postIds)
      && review.checks.every(check => typeof check === 'string') && review.alternatives.every(text => typeof text === 'string')
      && review.postIds.every(id => posts.has(id)));
}
