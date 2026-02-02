# Build Output Size Reduction — Tasks

## Description
Reduce the size of the compiled election artifacts (`public/data/compiled/<date>.json.gz`) by eliminating repeated strings/objects, removing duplicated representations, and improving compression. Changes focus on: (1) removing redundant fields, (2) moving “lookup data” to shared dictionaries, (3) storing compact numeric/enum representations, and (4) using stronger compression settings.

---

## Phase 0 — Baseline & Guardrails

- [x] **T0.1: Add build size report**
  - Print size of each output file (raw JSON bytes + gzipped bytes).
  - Output per date: `rawBytes`, `gzipBytes`, `ratio`.
  - Acceptance: build logs show sizes for each generated artifact.

- [x] **T0.2: Add smoke validation**
  - Ensure output JSON parses and contains expected top-level keys.
  - Acceptance: build fails if output is invalid JSON before compression.

---

## Phase 1 — Remove High-Duplication Strings

- [x] **T1.1: Remove `dateName` from all comparison entries**
  - Everywhere you do `{ value, date: d, dateName }` replace with a compact shape:
    - `{ v: value, d }`
  - Do this for:
    - `region.comparisons.*`
    - `section.comparisons.*`
    - per-party comparisons (`partyVotes[pid].comparisons`, `.percentComparisons`, `.paperComparisons`, `.machineComparisons`)
    - `topParties[*].comparisons`
  - Acceptance:
    - No `dateName` field exists anywhere in output.
    - UI resolves date name via `elections.json` (or a small `dateNameByDate` map).

- [x] **T1.2: Stop emitting `section.risks` (string array)**
  - Keep only structured `riskIndicators` / `candidateRiskIndicators`.
  - Remove the logic that builds/merges `section.risks` from indicator messages.
  - Acceptance:
    - `section.risks` does not exist in output.
    - UI shows risk text from `riskIndicators` (see Phase 2).

---

## Phase 2 — Stop Shipping Long Text Messages

- [x] **T2.1: Replace `riskIndicators[].message` with template-friendly data**
  - For each risk, output:
    - `code`, `category`, `severity`
    - `details` containing only numbers/ids needed to render the message
  - Example direction (do not ship as string):
    - `R6.1`: `{ avgSectionShareBp, avgMunicipalityShareBp, sectionsTriggered }`
    - `R1.1`: `{ turnoutChangeBp, sigma10 }` (or similar compact representation)
  - Acceptance:
    - No `message` property exists in any risk indicator in the output.
    - UI renders Bulgarian messages using a per-code template table.

- [x] **T2.2: Create UI risk message templates**
  - Map: `code -> (details) => message`
  - Must support all existing risk codes used by the build.
  - Consider a fallback for unknown codes.
  - Acceptance:
    - UI shows identical (or intentionally improved) text vs previous implementation.

---

## Phase 3 — Remove Per-Section Repeated Region Stats

- [x] **T3.1: Stop copying `municipalityPartyPercents` into each section**
  - Currently each section gets:
    - `s.municipalityAvgTurnout`
    - `s.municipalityPartyPercents`
  - Move these to the region object once, e.g.:
    - `regions[].avgTurnout`
    - `regions[].partyPercents`
  - Keep only a reference in section:
    - `section.regionId`
  - Acceptance:
    - Sections do not contain `municipalityPartyPercents`.
    - UI resolves region averages by looking up `regions` by `regionId`.

- [x] **T3.2: Remove `baseline` from output (or gate it)**
  - Option A (recommended for size): remove `section.baseline` entirely.
  - Option B (debug only): emit baseline only if section has risks AND behind a flag.
  - Acceptance:
    - `baseline` not present in normal builds (default).
    - If debug flag exists, it’s off by default.

---

## Phase 5 — Compact Numeric Encoding

- [x] **T5.1: Quantize percent floats to integers (basis points)**
  - Replace floats such as:
    - `activityPercent`, `percent`, `noVotesPercent`
  - With integers:
    - `activityBp = round(activityPercent * 10000)`
    - `percentBp = round(percent * 10000)`
  - Acceptance:
    - No percent floats are emitted (or only where strictly necessary).
    - UI divides by 10000 when displaying.

- [ ] **T5.2: Shorten key names for hot-path repeated structures (optional)**
  - For comparison entries:
    - `{ v, d }` already covered
  - For common numeric fields:
    - `voted -> v`, `total -> t`, `discardedVotes -> inv` (example mapping)
  - Acceptance:
    - Document a single mapping table used by both build + UI.
    - UI reads new keys correctly.

---

## Phase 6 — Stronger Compression

- [x] **T6.1: Gzip max compression**
  - Change gzip call to:
    - `zlib.gzipSync(json, { level: 9 })`
  - Acceptance:
    - Output file sizes decrease measurably vs baseline.

- [ ] **T6.2: Add Brotli output (optional, best size)**
  - Produce:
    - `${date}.json.br` alongside `.gz`
  - Acceptance:
    - Hosting can serve `.br` when supported.
    - UI fetch prefers `.br` and falls back to `.gz`.

---

## Phase 7 — Split Stable Dictionaries (Bigger Refactor, Biggest Gains)

- [ ] **T7.1: Extract section metadata to a shared file**
  - Create `compiled/sections_meta.json.(gz|br)` containing:
    - `sectionId -> { regionId, regionName, cityName, sectionName, sectionType }`
  - Then date files contain only:
    - `sectionId -> numeric fields + risk codes + series`
  - Acceptance:
    - Per-date artifacts shrink substantially.
    - UI loads meta once and joins by `sectionId`.

- [ ] **T7.2: Extract candidate metadata to a shared file**
  - Create `compiled/candidates_meta_<date>.json.(gz|br)`:
    - `candidateKey -> { candidateId, partyId, candidateName, partyName, regionId }`
  - Date file contains only numeric/risk data keyed by candidateKey.
  - Acceptance:
    - Candidate names are no longer repeated across many sections.

## Phase 8 — Binary Format Migration (No Backward Compatibility)

### Decision
- Replace JSON entirely with **Protocol Buffers**
- Remove all JSON outputs, loaders, and compatibility code paths.

---

## Phase 8.1 — Hard Switch: Protobuf Only

- [ ] **T8.1: Delete JSON emission**
  - Remove:
    - `const json = JSON.stringify(finalResult)`
    - `.json.gz` writes
    - JSON cleanup that deletes `.json` files
  - Acceptance:
    - build produces **no** JSON artifacts.

- [ ] **T8.2: Rename output to protobuf artifacts**
  - Output file name:
    - `compiled/<date>.pb` + compression variant
  - Recommended:
    - `compiled/<date>.pb.br` (primary)
    - optionally `compiled/<date>.pb.gz` (fallback if your hosting isn’t brotli-friendly)
  - Acceptance:
    - compiled directory contains only protobuf artifacts.

---

## Phase 8.2 — Schema First: Make It Compact

- [ ] **T8.3: Design proto schema to avoid maps-of-objects where possible**
  - Prefer:
    - repeated arrays with implicit ordering for dense data
  - Example:
    - `repeated Section sections = 1;`
    - store `region_index` instead of `regionId` string if you build region dictionary
  - Acceptance:
    - schema minimizes string usage and nested maps.

- [ ] **T8.4: Convert enums**
  - Replace strings with enums:
    - `Severity`
    - `SectionType`
    - `RiskCode` (optional but recommended)
  - Acceptance:
    - output contains no repeated textual enums.

- [ ] **T8.5: Quantize floats**
  - Replace float ratios with integer basis points:
    - `uint32 activity_bp`
    - `uint32 percent_bp`
  - Acceptance:
    - proto has no floats unless unavoidable.

---

## Phase 8.3 — Split Meta vs Per-Date Payload (Largest Size Win)

- [ ] **T8.6: Emit `meta.pb.br` once**
  - Create `compiled/meta.pb.br` containing:
    - `regions`: `{ regionId, regionName }`
    - `sections`: `{ sectionId, regionId, cityName, sectionName, sectionType }`
  - Remove these fields from per-date output.
  - Acceptance:
    - per-date files contain **no** names, only ids + numbers.

- [ ] **T8.7: Emit `parties_<date>.pb.br`**
  - Parties can change per election, so keep it per-date:
    - `partyId -> partyName`
    - optionally also store `normalized_party_id` mapping for comparisons
  - Acceptance:
    - per-date payload doesn’t embed party names anywhere else.

- [ ] **T8.8: Emit `candidates_<date>.pb.br`**
  - Candidate lists are date-specific:
    - candidateKey -> `{ candidateId, partyId, name }`
  - Per-date section data stores only candidateKey + numeric votes/risk flags.
  - Acceptance:
    - candidateName/partyName not repeated per section.

---

## Phase 8.4 — Remove Verbose Runtime Text from Output

- [ ] **T8.9: Remove all human-readable risk messages from build output**
  - Risks become:
    - `code`, `severity`, `details` (numbers + ids only)
  - UI renders Bulgarian message templates.
  - Acceptance:
    - protobuf contains **zero** Bulgarian long strings.

- [ ] **T8.10: Remove duplicated risk containers**
  - Keep exactly:
    - `section.risk_indicators` (section-level)
    - `section.candidate_risk_indicators` (candidate-level events, keyed)
  - Delete:
    - `section.risks` (strings)
    - any duplicated message arrays
  - Acceptance:
    - each risk exists in exactly one canonical place.

---

## Phase 8.5 — Rework Comparisons for Size

- [ ] **T8.11: Compact comparisons shape**
  - Replace:
    - `{ value, date }` objects
  - With:
    - `repeated uint32 date_index`
    - `repeated sint32 values` (same ordering)
  - Or:
    - `repeated ComparisonPoint { uint32 d; sint32 v; }` (still smaller than JSON)
  - Acceptance:
    - comparisons no longer allocate repeated object wrappers.

- [ ] **T8.12: Remove per-party comparisons stored under every partyVotes entry**
  - Keep comparisons only at:
    - section-level + region-level
  - UI derives party series from:
    - baseline partyVotes + comparison sections
  - Acceptance:
    - `partyVotes[*].comparisons` removed from output.

---

## Phase 8.6 — Frontend: Protobuf-Only Loader

- [ ] **T8.13: Replace JSON fetch/decode with protobuf decode**
  - Load order:
    1) `meta.pb.br`
    2) `parties_<date>.pb.br`
    3) `candidates_<date>.pb.br`
    4) `<date>.pb.br`
  - Acceptance:
    - app renders successfully with protobuf only.

- [ ] **T8.14: Add “schema_version mismatch” fatal error**
  - If UI schema doesn’t match output schema:
    - fail fast with a clear dev error
  - Acceptance:
    - broken schema changes are caught immediately.

---

## Phase 8.7 — Compression & Hosting

- [ ] **T8.15: Switch primary compression to Brotli**
  - Use `zlib.brotliCompressSync(buffer, { params: { [BROTLI_PARAM_QUALITY]: 11 } })`
  - Keep gzip only if needed.
  - Acceptance:
    - `.br` is the primary artifact and is smallest.

- [ ] **T8.16: Verify server serves `.br` with correct content-encoding**
  - Ensure:
    - `Content-Type: application/octet-stream` (or `application/x-protobuf`)
    - `Content-Encoding: br`
  - Acceptance:
    - browser loads `.br` without manual decompression.

---

## Phase 8.8 — Build Output Audit

- [ ] **T8.17: Add build output size report (protobuf only)**
  - Print:
    - meta.pb.br bytes
    - parties_<date>.pb.br bytes
    - candidates_<date>.pb.br bytes
    - <date>.pb.br bytes
  - Acceptance:
    - size regressions are visible in logs.

- [ ] **T8.18: Add “size budget” guard (optional)**
  - Example:
    - fail build if any `<date>.pb.br` exceeds X MB
  - Acceptance:
    - prevents accidental bloat (e.g. reintroducing messages).


---

## Definition of Done
- [ ] Build artifacts are smaller (report shows per-date gz bytes reduced).
- [ ] UI loads and renders the same views without missing data.
- [ ] No duplicated “risk messages” arrays exist in output.
- [ ] Risks are rendered from templates using compact `details`.
- [ ] Comparisons store no `dateName` strings and use compact entries.

---
