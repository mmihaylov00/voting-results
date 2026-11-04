import { describe, expect, it } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookPost, FacebookReport } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, facebookCount, facebookDailyCounts, facebookDate, facebookPageSummaries, facebookStanceSummary, facebookTime, facebookTotal, validFacebookReport } from './facebook-research.util';

const report = snapshot as FacebookReport;

describe('Facebook research data', () => {
  it('keeps candidate assessments independent, counts every post and preserves unreviewed captions', () => {
    const pages = facebookPageSummaries(report);
    for (const page of pages) {
      for (const candidate of FACEBOOK_CANDIDATES) {
        expect(Object.values(page.stance[candidate].counts).reduce((sum, count) => sum + count, 0)).toBe(page.postCount);
      }
    }
    expect(report.posts.filter(post => post.stance)).toHaveLength(94);
    const bnews = pages.find(page => page.name === 'BNews Bg')!;
    expect(bnews.stance.gyurov.label).toBe('critical');
    expect(bnews.stance.gyurov.counts.critical).toBe(15);
    const bunker = pages.find(page => page.name === 'Бункер нюз')!;
    expect(bunker.stance.gyurov.counts.supportive).toBe(1);
    expect(bunker.stance.yotova.counts.critical).toBe(8);
    const criticalOnly = report.posts.find(post => post.stance?.yotova === 'critical' && post.stance.gyurov === null)!;
    expect(facebookStanceSummary([criticalOnly]).gyurov.label).toBe('not-mentioned');
    expect(facebookStanceSummary([report.posts[49]]).gyurov.label).toBe('unreviewed');
    expect(pages.find(page => page.name === 'Новини на фокус')!.stance.gyurov.label).toBe('mixed');
  });

  it('does not weight tone by engagement or confuse informative and unclear captions with support', () => {
    const positive = structuredClone(report.posts.find(post => post.stance?.gyurov === 'supportive')!);
    const negative = structuredClone(report.posts.find(post => post.stance?.gyurov === 'critical')!);
    positive.metrics.reactions.value = 1_000_000;
    negative.metrics.reactions.value = 0;
    const summary = facebookStanceSummary([positive, negative]).gyurov;
    expect(summary.label).toBe('mixed');
    expect(summary.counts.supportive).toBe(1);
    expect(summary.counts.critical).toBe(1);
    const neutral = report.posts.find(post => post.stance?.gyurov === 'neutral')!;
    const unclear = report.posts.find(post => post.stance?.gyurov === 'unclear')!;
    expect(facebookStanceSummary([neutral]).gyurov.label).toBe('neutral');
    expect(facebookStanceSummary([unclear]).gyurov.label).toBe('unclear');
    expect(facebookStanceSummary([]).gyurov.label).toBe('unreviewed');
    positive.stance!.gyurov = 'mixed';
    expect(facebookStanceSummary([positive]).gyurov.label).toBe('mixed');
  });

  it('validates annotated tones, reasons and source hashes while accepting older unreviewed snapshots', () => {
    for (const invalid of [null, {}, { ...report.posts[0].stance!, gyurov: 'fake-news' },
      { ...report.posts[0].stance!, reason: ' ' }, { ...report.posts[0].stance!, sourceTextSha256: 'a'.repeat(64) }]) {
      const wrong = structuredClone(report);
      wrong.posts[0].stance = invalid as unknown as FacebookPost['stance'];
      expect(validFacebookReport(wrong)).toBe(false);
    }
    const legacy = structuredClone(report);
    for (const post of legacy.posts) delete post.stance;
    expect(validFacebookReport(legacy)).toBe(true);
  });

  it('keeps the collection and later matches separate with valid public-source references', () => {
    expect(validFacebookReport(report)).toBe(true);
    expect(report.posts).toHaveLength(97);
    expect(report.pages).toHaveLength(19);
    expect(report.posts.filter(post => post.origin === 'collection')).toHaveLength(83);
    expect(report.posts.filter(post => post.origin === 'discovery')).toHaveLength(14);
    expect(report.matches).toHaveLength(14);
    expect(new Set(report.matches.map(match => match.sourceId)).size).toBe(10);
    for (const match of report.matches) {
      const source = report.posts.find(post => post.id === match.sourceId)!;
      const target = report.posts.find(post => post.id === match.targetId)!;
      expect(source.pageId).not.toBe(target.pageId);
      expect((Date.parse(target.publishedAt!) - Date.parse(source.publishedAt!)) / 60_000).toBe(match.delayMinutes);
    }
    expect(JSON.stringify(report)).not.toContain('raw/');
    expect(JSON.stringify(report)).not.toContain('/Users/');
  });

  it('counts each matching post once across the expanded sample and marks caption-derived terms', () => {
    expect(report.coverage).toHaveLength(55);
    expect(report.coverage.filter(row => row.fromCaptions)).toHaveLength(20);
    for (const row of report.coverage) {
      expect(row.count).toBe(report.posts.filter(post => post.keywords.some(match => match.keyword === row.keyword)).length);
      expect(row.count).toBeLessThan(report.keywordTarget);
      if (row.fromCaptions) expect(row.count).toBeGreaterThan(0);
    }
    const turkey = report.coverage.find(row => row.keyword === 'Турция')!;
    expect(turkey.count).toBeGreaterThan(report.posts.filter(post => post.origin === 'collection'
      && post.keywords.some(match => match.keyword === 'Турция')).length);
    expect(report.coverage.find(row => row.keyword === 'костадинов')?.count).toBe(2);
    expect(report.coverage.find(row => row.keyword === 'Колтуклиева')?.count).toBe(1);
    expect(report.coverage.find(row => row.keyword === 'измете')?.count).toBe(5);
  });

  it('matches the captured link-preview headline without treating the four captions as identical bodies', () => {
    const source = report.posts.find(post => post.linkHeadline)!;
    const matches = report.matches.filter(match => match.sourceId === source.id);
    expect(matches).toHaveLength(3);
    const headline = source.linkHeadline!.replace(/ - Осата$/, '');
    for (const match of matches) {
      expect(match.kind).toBe('headline');
      expect(match.delayMinutes).toBe(1146);
      expect(report.posts.find(post => post.id === match.targetId)?.excerpt).toBe(headline);
    }
    expect(source.excerpt).not.toBe(headline);
  });

  it('rejects inconsistent counts, duplicate coverage rows and unknown keyword references', () => {
    const wrongCount = structuredClone(report);
    wrongCount.coverage[0].count++;
    expect(validFacebookReport(wrongCount)).toBe(false);
    const duplicate = structuredClone(report);
    duplicate.coverage.push(duplicate.coverage[0]);
    expect(validFacebookReport(duplicate)).toBe(false);
    const unknown = structuredClone(report);
    unknown.posts[0].keywords.push({ keyword: 'unknown', source: 'text', evidence: 'unknown' });
    expect(validFacebookReport(unknown)).toBe(false);
  });

  it('preserves missing counters and rounded values in Page totals', () => {
    const missing = structuredClone(report.posts[0]);
    missing.metrics.shares = { value: null, approximate: null, raw: null };
    expect(facebookTotal([missing], 'shares')).toEqual({ value: null, approximate: false, missing: 1 });
    const zero = structuredClone(missing);
    zero.metrics.shares = { value: 0, approximate: false, raw: '0' };
    expect(facebookTotal([missing, zero], 'shares')).toEqual({ value: 0, approximate: false, missing: 1 });
    const summaries = facebookPageSummaries(report);
    expect(summaries.reduce((sum, page) => sum + page.postCount, 0)).toBe(97);
    expect(summaries.find(page => page.name === 'BNews Bg')?.totals.shares.missing).toBe(4);
    expect(summaries.find(page => page.name === 'Бункер нюз')?.totals.reactions.approximate).toBe(true);
    expect(facebookCount(null)).toBe('—');
    expect(facebookCount(0)).toBe('0');
    expect(facebookCount(1200, true)).toContain('≈');
  });

  it('does not assign an exact publication day to an interval-dated post', () => {
    const days = facebookDailyCounts(report.posts);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(96);
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

  it('accepts only local, content-addressed images attributed to their own public source', () => {
    expect(report.pages.every(page => page.avatar?.sourceUrl === page.url)).toBe(true);
    expect(report.posts.filter(post => post.images?.length)).toHaveLength(92);
    expect(report.posts.filter(post => post.images?.some(image => image.kind === 'video-thumbnail'))).toHaveLength(5);
    for (const value of ['https://external.example/image.jpg', '/images/facebook/2026/../private.jpg', 'javascript:alert(1)']) {
      const wrong = structuredClone(report);
      wrong.pages[0].avatar!.src = value;
      expect(validFacebookReport(wrong)).toBe(false);
    }
    const wrongSource = structuredClone(report);
    wrongSource.posts[0].images![0].sourceUrl = report.posts[1].url;
    expect(validFacebookReport(wrongSource)).toBe(false);
    const wrongSize = structuredClone(report);
    wrongSize.posts[0].images![0].height = 0;
    expect(validFacebookReport(wrongSize)).toBe(false);
    const noImages = structuredClone(report);
    for (const page of noImages.pages) delete page.avatar;
    for (const post of noImages.posts) delete post.images;
    expect(validFacebookReport(noImages)).toBe(true);
  });

  it('validates optional platform labels and link headlines without requiring them on older records', () => {
    const legacy = structuredClone(report);
    for (const post of legacy.posts) {
      delete post.platformLabels;
      delete post.linkHeadline;
    }
    expect(validFacebookReport(legacy)).toBe(true);
    for (const invalid of [null, {}, [' '], [null]]) {
      const wrong = structuredClone(report);
      wrong.posts[0].platformLabels = invalid as unknown as FacebookPost['platformLabels'];
      expect(validFacebookReport(wrong)).toBe(false);
    }
    for (const invalid of [null, 1, ' ']) {
      const wrong = structuredClone(report);
      wrong.posts[0].linkHeadline = invalid as unknown as string;
      expect(validFacebookReport(wrong)).toBe(false);
    }
  });
});
