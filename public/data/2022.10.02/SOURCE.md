# Октомври 2022

Official source: https://results.cik.bg/ns2022/export.zip
Raw archive is not committed; keep downloaded raw archives local under raw/ when needed.
CIK metadata used: np/readme_02.10.2022.txt

## Canonical Files
- sections.txt <- np/sections_02.10.2022.txt
- protocols.txt <- np/protocols_02.10.2022.txt
- votes.txt <- np/votes_02.10.2022.txt
- cik_parties.txt <- np/cik_parties_02.10.2022.txt

## Normalization Notes
- The official CIK files in this archive do not include header rows; canonical headers were added from the bundled readme description.
- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.
- Missing section addresses are stored as empty section names and resolved through the existing settlement/geography fallback logic.

## CIK verification and corrections

Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered fields in its bundled readme. The normalized SHTABO protocol fields had incorrect invalid-vote, no-support, and ballot-type positions. Main protocols are read once; machine supplement no-support counts are added separately.

Party ballot-type splits and nonzero preferences are restored from the original rows. Paper-only protocols assign their votes to paper. Presidential ballot labels use the candidate tickets from `cik_candidates`, rather than sponsor names. Published source inconsistencies are preserved, including differences between totals and their paper/machine components.

Archive SHA-256: `d25e76bac4af48369a145535e731f53168a5e8e7c5ea294e4e1f5b95f882135e`.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6620820;230149;2601900;9042;5949;81686;259727;2342236.
Nonzero preference rows: 328134.
