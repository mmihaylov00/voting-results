export type FacebookMetric = 'reactions' | 'comments' | 'shares';
export type FacebookOrigin = 'collection' | 'discovery';

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
  images?: FacebookImage[];
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
  coverage: { keyword: string; count: number }[];
  reviews: FacebookReview[];
  sharedArticleUrl: string;
  collectionSha256: string;
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
}
