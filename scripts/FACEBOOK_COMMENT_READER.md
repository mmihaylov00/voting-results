# Anonymous comment reader

The research reader publishes reviewed excerpts of at most 280 Unicode characters, with snapshot-local comment and thread numbers. It does not publish author records, native comment IDs, exact comment permalinks, timestamps, raw-text hashes or private assessment reasons. Sources lead to the original post.

Raw captures, assessments and privacy reviews stay outside the repository. A privacy review is keyed by the original text hash and contains `text` (a redacted excerpt or `null`) and `reviewedAt`. Every unique source text needs a decision. Redactions may remove source text and insert the supported Bulgarian redaction markers; they must not invent or paraphrase a comment. Review names, contact details and sensitive personal information before generating public files.

Generate the reader from the same inputs as the aggregate report:

```sh
node scripts/build-facebook-comment-reader.js RAW.json ASSESSMENTS.json PRIVACY_REVIEWS.json
node --test scripts/facebook-comment-reader.test.js
```

The exporter rejects missing/stale inputs, identifiers and invented excerpt text before writing files. It writes one lazy-loaded JSON file per post, names it by its public content hash and replaces the manifest last. Outdated generated files are removed after a successful export. The reader also checks both candidates' tone counts against the aggregate row to reject mismatched labels-only deployments.

These are excerpts, not a complete transcript. Candidate labels describe the complete captured comment and thread. Hidden text does not change the existing aggregate counts. The captures contain no author IDs and support no reliable per-person or cross-Page author matching.
