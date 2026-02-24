# Cursor Coding Rules – HARD CONSTRAINTS

These rules apply to ALL code changes unless explicitly overridden.

## 1. Diff Discipline
- Do NOT rewrite entire files.
- Do NOT refactor for style, readability, or aesthetics.
- Touch the MINIMUM number of lines required.
- If more than ~120 lines must change, STOP and ASK FIRST.

## 2. Performance Work
When optimizing performance:
- Identify hotspots first.
- Optimize ONLY the identified hotspots.
- Do NOT change unrelated logic.
- Do NOT change output schemas, data shapes, or ordering.
- Do NOT introduce new abstractions unless unavoidable.

## 3. Parsing & Data Semantics
- Do NOT change parsing logic unless explicitly requested.
- Do NOT replace split/trim/regex logic unless asked.
- Assume parsing behavior is intentional and fragile.

## 4. Invariants (Non-Negotiable)
- Output JSON structure must remain IDENTICAL.
- Risk codes, messages, thresholds, and ordering must not change.
- Sorting behavior must not change.
- Numeric precision must not change.

## 5. Optimization Priority Order
Only optimize in this order:
1. Algorithmic complexity (O(n²) → O(n))
2. Repeated scans / filters / finds
3. Avoidable allocations inside hot loops

Ignore micro-optimizations unless requested.

## 6. Before Large Changes
If a request would cause:
- Large rewrites
- New helper systems
- Structural reorganization

You MUST:
- Explain the plan
- List exact sections to be changed
- Wait for confirmation

## 7. Output Expectations
- Prefer PATCH-STYLE changes.
- If outputting a full file, changes must be minimal and localized.
- Never surprise the user with a large rewrite.
