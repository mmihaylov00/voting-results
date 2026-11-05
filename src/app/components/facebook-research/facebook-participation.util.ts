import { FacebookCommentsReport, FacebookPost } from './facebook-research.models';

export type FacebookAccountCell = number | null;

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

/** Accept aggregate fields only and bind every count to the same captured comment snapshot. */
export function validFacebookParticipationReport(value: unknown, posts: readonly FacebookPost[],
  comments: FacebookCommentsReport): value is FacebookParticipationReport {
  if (!fields(value, ['version', 'runId', 'capturedAt', 'minimumCellCount', 'unit', 'collectionSha256',
    'coverage', 'totals', 'posts', 'pages', 'postOverlaps', 'pageOverlaps']) || value['version'] !== 1
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
  return true;
}
