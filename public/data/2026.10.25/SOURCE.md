# Official presidential results, 25 October 2026, round 1

Source: https://results.cik.bg/pvr202610/opendata/export.zip

Final updated database approved by CIK Decision 416-ПВР of 27 October 2026: https://www.cik.bg/bg/decisions/416/2026-10-27

Archive SHA-256: `fab23a6837b247f8892c7ee23bbfdb40c9b2b73e5aa4f15cee330e506cc8f314`.

Reproduce with `python3 scripts/repair-cik-data.py 2026.10.25 /path/to/export.zip`. The numbered fields below follow the bundled `readme_25.10.2026.txt`.

- Main forms 24-26 and 28-30: electors, added electors and signed voters use fields 9-11. Paper ballots, invalid paper votes and paper no-support votes use fields 12, 13 and 17.
- Machine-only forms 25/29 use field 14 for confirmed machine votes and sum no-support field 28 from their machine supplements 32/41.
- Mixed forms 26/30 use receipt fields 18+22, no-support fields 20+24 and unreadable receipt fields 21+25. Unreadable receipts remain included in machine cast counts and invalid votes.
- Vote rows preserve total, paper and combined machine votes from each six-field candidate block. Machine 1/2 subtotals are checked against the combined machine total. Ticket names use `cik_candidates`.
- Official section EKATTE, coordinates and flags replace the inferred page geography. Unescaped semicolons in addresses become commas; the last five fields retain coordinates and flags. Region number prefixes are removed and region 32 is labelled Чужбина.

Sections: 12719. Sections without coordinates: 339. No presidential preferences apply.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6584025;132022;1525034;3279;6833;60520;144698;1380304.

## Verification on 28 October 2026

Every candidate total matches the final national result table and all 32 regional result tables at https://results.cik.bg/pvr202610/rezultati/index.html. No-support votes total 67,353. National electors, added electors, signed voters, paper ballots, confirmed machine votes, invalid paper ballots and unreadable receipts match the published final CIK protocol. The activity page retains its national electorate of 6,637,238; with 1,525,034 signed voters this gives the published 22.98% turnout.

The archive contains revisions to 49 existing section protocols compared with the earlier 100% page snapshot. All 12,719 sections now have official EKATTE identifiers; 12,380 have published coordinates.

Published inconsistencies are preserved. Individual candidate vote rows sum to 1,454,357, while the national protocol's candidate-vote headline is 1,454,359. Candidate rows plus no-support votes sum to 1,521,710, while the protocol's headline valid-vote total is 1,521,723. The site uses the individual candidate rows without adjusting them to force agreement with these headlines.

The canonical machine count 1,380,304 includes one unreadable receipt; the national confirmed-machine count is 1,380,303. Canonical invalid votes combine 3,278 invalid paper ballots and that one unreadable machine receipt, consistent with the site's existing ballot-channel accounting.
