# Repeatable browser collection

Collection runs through the signed-in Chrome browser using the documented CUA Playwright interface.
It reads the rendered comment thread and uses only the comment-order, expansion and scrolling controls.
It does not intercept Facebook requests, read application state, export cookies or call undocumented APIs.
The reusable modules are `facebook-comment-browser.mjs`, `facebook-comment-driver.mjs` and
`facebook-comment-review.mjs` under `scripts/lib`.

## Capture and resume

Start a new private directory outside the repository, freeze `source-report.json`, and create an empty
version-1 capture. Preserve the preceding captures, assessments and published excerpt files.
Use `createCollector` with the filesystem, crypto module, capture object and directory. Apply
`ccInstallSnapshotFix` for singular/plural counters and disabled/loading controls. `createDriver` accepts
that collector and a dedicated browser tab; `createReviewer` adds a resumable post queue and ordering proof.

Each bounded `review.step(24)` targets an 18-second slice. The collector reads before and after every
expansion or scroll, retaining native comment IDs and complete text across virtualized DOM changes.
It writes `captures.json` atomically after observations. Queue and evidence files are also checkpointed.
Restore `review-state.json`, `traversal-qa.json`, captures and the participation state when resuming.
Use one mutable context object for modules/state in CUA callbacks; replacing a separate REPL variable
may leave an older binding inside an existing callback.

Confirm **All comments** through the visible control. A terminal counter gap requires a **Newest** pass
and native-ID union. Complete coverage requires no enabled/loading expansion controls, expanded texts,
captured reply parents, an exact observed counter and two stable terminal observations. An unknown
counter remains null. A blank view is not an observed zero; browser-control failures remain partial.
Restrictions and challenges stop the collector before another UI action. Never bypass them.

The raw capture format remains compatible with `build-facebook-comments.js` and contains no author fields.
Permalinks are constructed from the known source post, rather than retaining an author's profile URL.

## Separate participation counts

The optional `onObserve` callback receives only post ID, comment ID/parent pairs and ephemeral author
observations from the rendered byline. Process those observations with `facebook-participation.mjs`.
Keep a randomly generated 32-byte key in a separate private file and reuse it for all shards/resumes
of that run. Never log, commit or export the key.

The participation state stores domain-separated HMAC tokens and neutral counts per post/Page. It does
not store raw author identifiers, names, profile links, comment text, candidate tones or abuse labels.
Its comment-dedup tokens are separate from account counts; there is no saved comment-to-account mapping.
On resume, reconcile captured ID/parent pairs with empty author observations, then recover missing
identity coverage from the visible UI where possible.

`participationExport` emits aggregate post/Page counts and overlap tables. Account cells smaller than
five are suppressed. It never exports account tokens or per-account histories. Counts refer to observed
public identifiers, not verified unique people: mixed numeric IDs/handles, changed handles and unavailable
bylines can affect matching. No display-name matching or profile lookup resolves these differences.

## Publishing

Finish and validate the fresh collection before replacing published data. Reuse an earlier assessment
only when the source post/native comment ID and exact text hash still match. New or changed text needs
assessment and privacy review. Regenerate both aggregate and excerpt reports from the same source revision.
Changing collection order/hashes can invalidate old public local comment numbers and visitor suggestions;
never migrate a suggestion by local number alone.

Run the focused checks with:

```sh
node --test scripts/facebook-participation.test.js scripts/facebook-comment-browser.test.js scripts/facebook-comment-driver.test.js
```
