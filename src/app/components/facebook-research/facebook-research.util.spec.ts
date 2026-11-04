import { describe, expect, it } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookPost, FacebookReport } from './facebook-research.models';
import { facebookCount, facebookDailyCounts, facebookDate, facebookPageSummaries, facebookTime, facebookTotal, validFacebookReport } from './facebook-research.util';

const report = snapshot as FacebookReport;

describe('Facebook research data', () => {
  it('keeps the collection and later matches separate with valid public-source references', () => {
    expect(validFacebookReport(report)).toBe(true);
    expect(report.posts).toHaveLength(52);
    expect(report.pages).toHaveLength(8);
    expect(report.posts.filter(post => post.origin === 'collection')).toHaveLength(49);
    expect(report.posts.filter(post => post.origin === 'discovery')).toHaveLength(3);
    expect(report.matches).toHaveLength(3);
    expect(new Set(report.matches.map(match => match.sourceId)).size).toBe(2);
    for (const match of report.matches) {
      const source = report.posts.find(post => post.id === match.sourceId)!;
      const target = report.posts.find(post => post.id === match.targetId)!;
      expect(source.pageId).not.toBe(target.pageId);
      expect((Date.parse(target.publishedAt!) - Date.parse(source.publishedAt!)) / 60_000).toBe(match.delayMinutes);
    }
    expect(JSON.stringify(report)).not.toContain('raw/');
    expect(JSON.stringify(report)).not.toContain('/Users/');
  });

  it('reconciles every keyword count against the original 49 posts, without adding the discoveries', () => {
    expect(report.coverage).toHaveLength(34);
    for (const row of report.coverage) {
      expect(row.count).toBe(report.posts.filter(post => post.origin === 'collection'
        && post.keywords.some(match => match.keyword === row.keyword)).length);
      expect(row.count).toBeLessThan(report.keywordTarget);
    }
  });

  it('preserves missing counters and rounded values in Page totals', () => {
    const missing = structuredClone(report.posts[0]);
    missing.metrics.shares = { value: null, approximate: null, raw: null };
    expect(facebookTotal([missing], 'shares')).toEqual({ value: null, approximate: false, missing: 1 });
    const zero = structuredClone(missing);
    zero.metrics.shares = { value: 0, approximate: false, raw: '0' };
    expect(facebookTotal([missing, zero], 'shares')).toEqual({ value: 0, approximate: false, missing: 1 });
    const summaries = facebookPageSummaries(report);
    expect(summaries.reduce((sum, page) => sum + page.postCount, 0)).toBe(52);
    expect(summaries.find(page => page.name === 'BNews Bg')?.totals.shares.missing).toBe(4);
    expect(summaries.find(page => page.name === 'Бункер нюз')?.totals.reactions.approximate).toBe(true);
    expect(facebookCount(null)).toBe('—');
    expect(facebookCount(0)).toBe('0');
    expect(facebookCount(1200, true)).toContain('≈');
  });

  it('does not assign an exact publication day to an interval-dated post', () => {
    const days = facebookDailyCounts(report.posts);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(51);
    const interval = report.posts.find(post => post.interval)!;
    expect(facebookDate(interval)).toContain('28');
    expect(facebookDate(interval)).toContain('30');
    expect(facebookTime(interval)).toBe('');
    expect(facebookTime(report.posts.find(post => post.publishedAt === '2026-10-31T18:58:00+02:00')!)).toBe('18:58');
  });

  it('rejects malformed records, external executable URLs and broken references', () => {
    const wrongUrl = structuredClone(report);
    wrongUrl.posts[0].url = 'javascript:alert(1)';
    expect(validFacebookReport(wrongUrl)).toBe(false);
    const broken = structuredClone(report);
    broken.matches[0].targetId = 'missing';
    expect(validFacebookReport(broken)).toBe(false);
    const malformed = structuredClone(report);
    malformed.posts[0] = null as unknown as FacebookPost;
    expect(validFacebookReport(malformed)).toBe(false);
  });
});
