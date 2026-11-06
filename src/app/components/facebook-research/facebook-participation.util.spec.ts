import { describe, expect, it } from 'vitest';
import participationSnapshot from '../../../../public/data/facebook/2026/participation.json';
import reportSnapshot from '../../../../public/data/facebook/2026/report.json';
import commentsSnapshot from '../../../../public/data/facebook/2026/comments.json';
import { FacebookCommentsReport, FacebookReport } from './facebook-research.models';
import { FacebookParticipationReport, validFacebookParticipationReport } from './facebook-participation.util';

const data = participationSnapshot as FacebookParticipationReport;
const report = reportSnapshot as FacebookReport;
const comments = commentsSnapshot as FacebookCommentsReport;
const valid = (value: unknown) => validFacebookParticipationReport(value, report.posts, comments);

describe('Facebook account activity distribution', () => {
  it('validates the published aggregate grid and legacy reports without activity', () => {
    expect(valid(data)).toBe(true);
    expect(data.activity!.cells).toHaveLength(24);
    expect(data.activity!.pages).toHaveLength(data.pages.length);
    const legacy = structuredClone(data);
    delete legacy.activity;
    expect(valid(legacy)).toBe(true);
    const unchecked = new Set(comments.posts.filter(post => post.status === 'not-checked').map(post => post.postId));
    const emptyPages = data.pages.filter(page => data.posts.filter(post => post.pageId === page.pageId)
      .every(post => unchecked.has(post.postId)));
    expect(emptyPages.length).toBeGreaterThan(0);
    for (const page of emptyPages) {
      expect(data.activity!.pages.find(row => row.pageId === page.pageId)!.cells.every(row => row.accounts === null)).toBe(true);
    }
  });

  it('rejects incomplete grids, duplicate or unknown bands, small unsuppressed cells and identity fields', () => {
    const mutate: ((value: FacebookParticipationReport) => void)[] = [
      value => value.activity!.cells.pop(),
      value => value.activity!.cells[1] = value.activity!.cells[0],
      value => Object.assign(value.activity!.cells[0], { commentBand: '100' }),
      value => Object.assign(value.activity!.cells[0], { pageBand: 'all' }),
      value => value.activity!.cells[0].accounts = 4,
      value => value.activity!.cells[1].accounts = 5,
      value => Object.assign(value.activity!.cells[0], { accountId: 'unexpected' }),
      value => Object.assign(value.activity!, { accounts: [] }),
      value => Object.assign(value, { activity: null }),
    ];
    for (const change of mutate) {
      const value = structuredClone(data);
      change(value);
      expect(valid(value)).toBe(false);
    }
  });

  it('binds every Page cohort to known Pages, global cells and account totals', () => {
    const mutate: ((value: FacebookParticipationReport) => void)[] = [
      value => value.activity!.pages.pop(),
      value => value.activity!.pages[1] = value.activity!.pages[0],
      value => value.activity!.pages[0].pageId = 'unknown',
      value => value.activity!.pages[0].cells.pop(),
      value => value.activity!.pages[0].cells[0].accounts = data.totals.accounts!,
      value => value.activity!.cells.forEach(row => row.accounts = null),
      value => value.activity!.cells[0].accounts = data.totals.accounts! + 5,
    ];
    for (const change of mutate) {
      const value = structuredClone(data);
      change(value);
      expect(valid(value)).toBe(false);
    }
    expect(JSON.stringify(data.activity)).not.toMatch(/accountId|accountToken|author|uid:|handle:|[a-f0-9]{64}/);
  });
});
