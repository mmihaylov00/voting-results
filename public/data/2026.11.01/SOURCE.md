# Official presidential results, 01.11.2026, round 2

Source: https://results.cik.bg/pvr202610/tur2/opendata/export.zip

Final updated database approved by CIK Decision 440-ПВР of 3 November 2026: https://www.cik.bg/bg/decisions/440/2026-11-03

Archive SHA-256: `64edd702d8621f30ebaa9b52d22ffd2dd0695b41b11cc6b56f16bec2c35a34c4`.

Reproduce with `python3 scripts/repair-cik-data.py 2026.11.01 /path/to/export.zip`. The numbered fields below follow the bundled `readme_01.11.2026.txt`.

- Main forms 24-26 and 28-30: electors, added electors and signed voters use fields 9-11. Paper ballots, invalid paper votes and paper no-support votes use fields 12, 13 and 17.
- Machine-only forms 25/29 use field 14 for confirmed machine votes and sum no-support field 28 from their machine supplements 32/41.
- Mixed forms 26/30 use receipt fields 18+22, no-support fields 20+24 and unreadable receipt fields 21+25. Unreadable receipts remain included in machine cast counts and invalid votes.
- Vote rows preserve total, paper and combined machine votes from each six-field candidate block. Machine 1/2 subtotals are checked against the combined machine total. Ticket names use `cik_candidates`.
- Official section EKATTE, coordinates and flags replace the inferred page geography. Unescaped semicolons in addresses become commas; the last five fields retain coordinates and flags. Region number prefixes are removed and region 32 is labelled Чужбина.

Sections: 12717. Sections without coordinates: 263. No presidential preferences apply.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6591952;171497;1902933;2612;5618;50462;170520;1732163.

## Cross-checks and preserved source inconsistencies

Candidate totals (Gyurov 750,251; Yotova 1,093,852) and no-support votes (56,080) match the national result and all 32 regional result pages. National registered, added, signed, invalid and paper-ballot totals also match. See [official-checks.json](official-checks.json) for source URLs, page hashes and checked values.

The archive sums to 1,732,163 machine votes, while the final national page reports 1,732,164. Candidate plus no-support rows sum to 1,900,183 valid votes, while the national protocol headline reports 1,900,072. Original section values are preserved; no balancing adjustment is applied.

Compared with the superseded mined snapshot, protocol fields change in 61 sections: totalA +1,919; totalB -134; signed voters -42; paper cast +73; machine cast -208. Candidate and no-support vote rows are unchanged. These are source corrections, not inferred changes in electoral behaviour.
