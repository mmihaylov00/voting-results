# Visitor tone suggestions

The editor is available at `/research/facebook-elections-2026/tones`, linked from the Facebook research header.
It lists every published post and captured comment. Comments without a published excerpt cannot be edited.
Each item has separate Gyurov and Yotova assessments. Edits are drafts in the visitor's browser until submitted.

## Shared inbox

Suggestions are sent to `/api/facebook-tone-suggestions`, in batches of at most 100 items.
The Netlify Function validates the payload against the bundled public snapshot and writes to the private
`facebook-tone-suggestions` Blobs store. Browse/download records through Netlify's Data & Storage > Blobs.
There is no public read endpoint. Form detection does not need to be enabled.

The payload contains a schema version, a random batch ID and the proposed changes. It does not contain
comment text, names, profile links or a visitor account identifier. Netlify may retain connection metadata.
Failed requests leave drafts in place. Only a matching JSON receipt removes the submitted drafts.
Repeated batch IDs are idempotent; reusing an ID for different changes is rejected.
The endpoint limits payload size and uses Netlify's per-IP rate limiting. Platform usage limits still apply.
Netlify Forms is deliberately not used: this account's legacy free plan can pause sites at 100 verified form submissions.

## Review before publishing

Submissions never directly change the research data or charts. Treat every submission as untrusted.
Before approving a change, validate its exact fields and tone values, then match it to the current source:

- Posts: post ID, collection hash, source-text hash and both original tones.
- Comments: post ID, local comment number, collection hash, reader-file content hash and both original tones.

Use `validToneReviewDrafts` and `matchingToneReviewDraft` in `facebook-tone-review.util.ts` as the schema and
snapshot checks. Comment numbers only identify comments inside that exact source revision.
Reject duplicate, stale or unverifiable records. Review the full post/thread context before accepting a tone.

Apply approved changes through the existing assessment/build workflow. For comments, rebuild both the aggregate
report and the public excerpt files with the reviewed assessment revision. Preserve the captured source and prior
assessment history. Do not overwrite a public report or its totals directly from a form payload.
