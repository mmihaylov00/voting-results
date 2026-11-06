import { FacebookCommentsReport, FacebookPost } from './facebook-research.models';

export type FacebookAccountCell = number | null;
export const FACEBOOK_COMMENT_BANDS = ['1', '2', '3-5', '6-10', '11-20', '21+'] as const;
export const FACEBOOK_PAGE_BANDS = ['1', '2', '3', '4+'] as const;

export interface FacebookActivityCell {
  commentBand: typeof FACEBOOK_COMMENT_BANDS[number];
  pageBand: typeof FACEBOOK_PAGE_BANDS[number];
  accounts: FacebookAccountCell;
}

export interface FacebookParticipationActivity {
  cells: FacebookActivityCell[];
  pages: { pageId: string; cells: FacebookActivityCell[] }[];
}

export interface FacebookParticipationPost {
  postId: string;
  pageId: string;
  capturedComments: number;
  topLevelComments: number;
  replyComments: number;
  matchedIdentityComments: number;
  accounts: FacebookAccountCell;
  accountsStartingThreads: FacebookAccountCell;
  accountsWithMultipleComments: FacebookAccountCell;
}

export interface FacebookParticipationPage {
  pageId: string;
  postCount: number;
  capturedComments: number;
  matchedIdentityComments: number;
  accounts: FacebookAccountCell;
}

export interface FacebookPostOverlap {
  leftPostId: string;
  rightPostId: string;
  sharedAccounts: number;
}

export interface FacebookPageOverlap {
  leftPageId: string;
  rightPageId: string;
  sharedAccounts: number;
}

export interface FacebookParticipationReport {
  version: 1;
  runId: string;
  capturedAt: string;
  minimumCellCount: 5;
  unit: 'observed-accounts';
  collectionSha256: string;
  coverage: { capturedComments: number; matchedIdentityComments: number; unknownIdentityComments: number };
  totals: { accounts: FacebookAccountCell; accountsOnMultiplePosts: FacebookAccountCell; accountsOnMultiplePages: FacebookAccountCell };
  posts: FacebookParticipationPost[];
  pages: FacebookParticipationPage[];
  postOverlaps: FacebookPostOverlap[];
  pageOverlaps: FacebookPageOverlap[];
  activity?: FacebookParticipationActivity;
}

const fields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= 512 && !/[\u0000-\u001f]/.test(value);
const cell = (value: unknown): value is FacebookAccountCell => value === null || count(value) && value >= 5;
const within = (value: FacebookAccountCell, maximum: number) => value === null || value <= maximum;
const subset = (value: FacebookAccountCell, total: FacebookAccountCell) => value === null || total !== null && value <= total;

function postRow(value: unknown): value is FacebookParticipationPost {
  return fields(value, ['postId', 'pageId', 'capturedComments', 'topLevelComments', 'replyComments',
    'matchedIdentityComments', 'accounts', 'accountsStartingThreads', 'accountsWithMultipleComments'])
    && id(value['postId']) && id(value['pageId'])
    && ['capturedComments', 'topLevelComments', 'replyComments', 'matchedIdentityComments'].every(key => count(value[key]))
    && ['accounts', 'accountsStartingThreads', 'accountsWithMultipleComments'].every(key => cell(value[key]));
}

function pageRow(value: unknown): value is FacebookParticipationPage {
  return fields(value, ['pageId', 'postCount', 'capturedComments', 'matchedIdentityComments', 'accounts'])
    && id(value['pageId']) && ['postCount', 'capturedComments', 'matchedIdentityComments'].every(key => count(value[key]))
    && cell(value['accounts']);
}

function postOverlap(value: unknown): value is FacebookPostOverlap {
  return fields(value, ['leftPostId', 'rightPostId', 'sharedAccounts']) && id(value['leftPostId'])
    && id(value['rightPostId']) && count(value['sharedAccounts']) && value['sharedAccounts'] >= 5;
}

function pageOverlap(value: unknown): value is FacebookPageOverlap {
  return fields(value, ['leftPageId', 'rightPageId', 'sharedAccounts']) && id(value['leftPageId'])
    && id(value['rightPageId']) && count(value['sharedAccounts']) && value['sharedAccounts'] >= 5;
}

function coverageRow(value: unknown): value is FacebookParticipationReport['coverage'] {
  return fields(value, ['capturedComments', 'matchedIdentityComments', 'unknownIdentityComments'])
    && Object.values(value).every(count);
}

function totalsRow(value: unknown): value is FacebookParticipationReport['totals'] {
  return fields(value, ['accounts', 'accountsOnMultiplePosts', 'accountsOnMultiplePages'])
    && Object.values(value).every(cell);
}

function activityCells(value: unknown): value is FacebookActivityCell[] {
  if (!Array.isArray(value) || value.length !== FACEBOOK_COMMENT_BANDS.length * FACEBOOK_PAGE_BANDS.length) return false;
  const keys = new Set<string>();
  for (const row of value) {
    if (!fields(row, ['commentBand', 'pageBand', 'accounts'])
      || !FACEBOOK_COMMENT_BANDS.some(band => band === row['commentBand'])
      || !FACEBOOK_PAGE_BANDS.some(band => band === row['pageBand']) || !cell(row['accounts'])) return false;
    const commentIndex = FACEBOOK_COMMENT_BANDS.findIndex(band => band === row['commentBand']);
    const pageIndex = FACEBOOK_PAGE_BANDS.findIndex(band => band === row['pageBand']);
    if (row['accounts'] !== null && pageIndex + 1 > [1, 2, 5, 10, 20, Infinity][commentIndex]) return false;
    const key = `${row['commentBand']}|${row['pageBand']}`;
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

function activityTotal(cells: FacebookActivityCell[], total: FacebookAccountCell): boolean {
  const visible = cells.reduce((sum, row) => sum + (row.accounts ?? 0), 0);
  return cells.every(row => subset(row.accounts, total)) && (total === null || visible <= total
    && total - visible <= cells.filter(row => row.accounts === null).length * 4);
}

function activityRow(value: unknown, pages: Map<string, FacebookParticipationPage>,
  totals: FacebookParticipationReport['totals'], matched: number): value is FacebookParticipationActivity {
  if (!fields(value, ['cells', 'pages']) || !activityCells(value['cells']) || !Array.isArray(value['pages'])
    || value['pages'].length !== pages.size || !activityTotal(value['cells'], totals.accounts)
    || !activityTotal(value['cells'].filter(row => row.pageBand !== '1'), totals.accountsOnMultiplePages)) return false;
  const minimumComments = value['cells'].reduce((sum, row) => sum + (row.accounts ?? 0)
    * [1, 2, 3, 6, 11, 21][FACEBOOK_COMMENT_BANDS.indexOf(row.commentBand)], 0);
  if (minimumComments > matched) return false;
  const global = new Map(value['cells'].map(row => [`${row.commentBand}|${row.pageBand}`, row.accounts]));
  const checked = new Set<string>();
  for (const row of value['pages']) {
    if (!fields(row, ['pageId', 'cells']) || !id(row['pageId']) || !activityCells(row['cells'])) return false;
    const page = pages.get(row['pageId']);
    if (!page || checked.has(page.pageId) || !activityTotal(row['cells'], page.accounts)
      || !row['cells'].every(cell => subset(cell.accounts, global.get(`${cell.commentBand}|${cell.pageBand}`)!))) return false;
    checked.add(page.pageId);
  }
  return true;
}

/** Accept aggregate fields only and bind every count to the same captured comment snapshot. */
export function validFacebookParticipationReport(value: unknown, posts: readonly FacebookPost[],
  comments: FacebookCommentsReport): value is FacebookParticipationReport {
  const hasActivity = value !== null && typeof value === 'object' && Object.hasOwn(value, 'activity');
  if (!fields(value, ['version', 'runId', 'capturedAt', 'minimumCellCount', 'unit', 'collectionSha256',
    'coverage', 'totals', 'posts', 'pages', 'postOverlaps', 'pageOverlaps', ...(hasActivity ? ['activity'] : [])]) || value['version'] !== 1
    || !id(value['runId']) || typeof value['capturedAt'] !== 'string' || !Number.isFinite(Date.parse(value['capturedAt']))
    || value['minimumCellCount'] !== 5 || value['unit'] !== 'observed-accounts'
    || typeof value['collectionSha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['collectionSha256'])
    || value['collectionSha256'] !== comments.collectionSha256
    || !coverageRow(value['coverage']) || !totalsRow(value['totals'])
    || !Array.isArray(value['posts']) || !value['posts'].every(postRow)
    || !Array.isArray(value['pages']) || !value['pages'].every(pageRow)
    || !Array.isArray(value['postOverlaps']) || !value['postOverlaps'].every(postOverlap)
    || !Array.isArray(value['pageOverlaps']) || !value['pageOverlaps'].every(pageOverlap)) return false;

  const rows = value['posts'];
  const pages = value['pages'];
  const totals = value['totals'];
  const coverage = value['coverage'];
  const sourcePosts = new Map(posts.map(post => [post.id, post]));
  const sourceCounts = new Map(comments.posts.map(post => [post.postId, post]));
  const byPost = new Map(rows.map(post => [post.postId, post]));
  const byPage = new Map(pages.map(page => [page.pageId, page]));
  if (byPost.size !== rows.length || rows.length !== posts.length || byPage.size !== pages.length) return false;
  let captured = 0;
  let matched = 0;
  const pageSums = new Map<string, { posts: number; captured: number; matched: number }>();
  for (const row of rows) {
    const source = sourcePosts.get(row.postId);
    const sourceCount = sourceCounts.get(row.postId);
    if (!source || !sourceCount || row.pageId !== source.pageId || row.capturedComments !== sourceCount.capturedCount
      || row.topLevelComments !== sourceCount.topLevelCount || row.replyComments !== sourceCount.replyCount
      || row.topLevelComments + row.replyComments !== row.capturedComments
      || row.matchedIdentityComments > row.capturedComments || !within(row.accounts, row.matchedIdentityComments)
      || !subset(row.accountsStartingThreads, row.accounts) || !within(row.accountsStartingThreads, row.topLevelComments)
      || !subset(row.accountsWithMultipleComments, row.accounts)
      || !within(row.accountsWithMultipleComments, Math.floor(row.matchedIdentityComments / 2))) return false;
    captured += row.capturedComments;
    matched += row.matchedIdentityComments;
    const sum = pageSums.get(row.pageId) ?? { posts: 0, captured: 0, matched: 0 };
    sum.posts++; sum.captured += row.capturedComments; sum.matched += row.matchedIdentityComments;
    pageSums.set(row.pageId, sum);
  }
  if (captured !== coverage['capturedComments'] || matched !== coverage['matchedIdentityComments']
    || coverage['unknownIdentityComments'] !== captured - matched
    || !within(totals['accounts'], matched) || !subset(totals['accountsOnMultiplePosts'], totals['accounts'])
    || !subset(totals['accountsOnMultiplePages'], totals['accountsOnMultiplePosts']) || pages.length !== pageSums.size) return false;
  for (const page of pages) {
    const sum = pageSums.get(page.pageId);
    if (!sum || page.postCount !== sum.posts || page.capturedComments !== sum.captured
      || page.matchedIdentityComments !== sum.matched || !within(page.accounts, sum.matched)
      || !subset(page.accounts, totals['accounts'])) return false;
  }
  if (rows.some(row => !subset(row.accounts, byPage.get(row.pageId)!.accounts))) return false;
  const postPairs = new Set<string>();
  for (const overlap of value['postOverlaps']) {
    const left = byPost.get(overlap.leftPostId);
    const right = byPost.get(overlap.rightPostId);
    const key = JSON.stringify([overlap.leftPostId, overlap.rightPostId].sort());
    if (!left || !right || overlap.leftPostId === overlap.rightPostId || postPairs.has(key)
      || !subset(overlap.sharedAccounts, left.accounts) || !subset(overlap.sharedAccounts, right.accounts)
      || !subset(overlap.sharedAccounts, totals['accountsOnMultiplePosts'])) return false;
    postPairs.add(key);
  }
  const pagePairs = new Set<string>();
  for (const overlap of value['pageOverlaps']) {
    const left = byPage.get(overlap.leftPageId);
    const right = byPage.get(overlap.rightPageId);
    const key = JSON.stringify([overlap.leftPageId, overlap.rightPageId].sort());
    if (!left || !right || overlap.leftPageId === overlap.rightPageId || pagePairs.has(key)
      || !subset(overlap.sharedAccounts, left.accounts) || !subset(overlap.sharedAccounts, right.accounts)
      || !subset(overlap.sharedAccounts, totals['accountsOnMultiplePages'])) return false;
    pagePairs.add(key);
  }
  return !hasActivity || activityRow(value['activity'], byPage, totals, matched);
}
