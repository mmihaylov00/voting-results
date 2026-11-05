export type FacebookMetric = 'reactions' | 'comments' | 'shares';
export type FacebookOrigin = 'collection' | 'discovery';
export type FacebookCandidate = 'gyurov' | 'yotova';
export type FacebookTone = 'supportive' | 'critical' | 'mixed' | 'neutral' | 'unclear';
export type FacebookStanceLabel = FacebookTone | 'not-mentioned' | 'unreviewed';

export type FacebookCommentCoverageStatus = 'not-checked' | 'partial' | 'complete' | 'unavailable';
export type FacebookCommentOrdering = 'all' | 'newest' | 'most-relevant' | null;
export type FacebookCommentCounts = Record<FacebookStanceLabel, number>;

export interface FacebookCommentCoverage {
  postId: string;
  checkedAt: string | null;
  status: FacebookCommentCoverageStatus;
  ordering: FacebookCommentOrdering;
  reportedCount: number | null;
  capturedCount: number;
  assessedCount: number;
  topLevelCount: number;
  replyCount: number;
  counts: Record<FacebookCandidate, FacebookCommentCounts>;
  notes: string[];
}

export interface FacebookCommentsReport {
  version: 1;
  capturedAt: string;
  collectionSha256: string;
  posts: FacebookCommentCoverage[];
}

export type FacebookDirectoryStatus = 'in-sample' | 'page-verified' | 'publisher-linked' | 'unresolved' | 'ambiguous';

export interface FacebookDirectoryEntry {
  id: string;
  name: string;
  aliases: string[];
  status: FacebookDirectoryStatus;
  facebookUrl: string | null;
  websiteUrl: string | null;
  regional: boolean | null;
  coverage: string;
  regions: string[];
  sources: { url: string; note: string }[];
  notes: string[];
  samplePageId: string | null;
}

export interface FacebookDirectory {
  checkedAt: string;
  entries: FacebookDirectoryEntry[];
}

export interface FacebookPostStance {
  gyurov: FacebookTone | null;
  yotova: FacebookTone | null;
  reason: string;
  sourceTextSha256: string;
}

export type FacebookStanceSummary = Record<FacebookCandidate, {
  label: FacebookStanceLabel;
  counts: Record<FacebookStanceLabel, number>;
}>;

export interface FacebookImage {
  src: string;
  sourceUrl: string;
  width: number;
  height: number;
  kind: 'image' | 'video-thumbnail';
  capturedAt: string;
  sha256: string;
}

export interface FacebookCounter {
  value: number | null;
  approximate: boolean | null;
  raw: string | null;
}

export interface FacebookPage {
  id: string;
  name: string;
  url: string;
  followers: number | null;
  followersApproximate: boolean;
  satire: boolean;
  origin: FacebookOrigin;
  avatar?: FacebookImage;
}

export interface FacebookPost {
  id: string;
  pageId: string;
  url: string;
  publishedAt: string | null;
  date: string | null;
  interval: { start: string; end: string } | null;
  datePrecision: string;
  collectedAt: string;
  excerpt: string;
  summary: string;
  captionComplete: boolean | null;
  origin: FacebookOrigin;
  keywords: { keyword: string; source: string; evidence: string }[];
  metrics: Record<FacebookMetric, FacebookCounter>;
  sourceTextSha256: string;
  stance?: FacebookPostStance;
  images?: FacebookImage[];
  platformLabels?: string[];
  linkHeadline?: string;
}

export interface FacebookMatch {
  sourceId: string;
  targetId: string;
  kind: 'body' | 'headline';
  delayMinutes: number;
}

export interface FacebookReview {
  id: string;
  title: string;
  summary: string;
  postIds: string[];
  checks: string[];
  alternatives: string[];
}

export interface FacebookReport {
  version: number;
  period: string;
  collectionDate: string;
  collectionPostCount: number;
  titleSearchCount: number;
  keywordTarget: number;
  pages: FacebookPage[];
  posts: FacebookPost[];
  matches: FacebookMatch[];
  coverage: { keyword: string; count: number; fromCaptions?: boolean }[];
  reviews: FacebookReview[];
  sharedArticleUrl: string;
  collectionSha256: string;
  directory?: FacebookDirectory;
}

export interface FacebookTotal {
  value: number | null;
  approximate: boolean;
  missing: number;
}

export interface FacebookPageSummary extends FacebookPage {
  postCount: number;
  collectionPosts: number;
  totals: Record<FacebookMetric, FacebookTotal>;
  stance: FacebookStanceSummary;
}
