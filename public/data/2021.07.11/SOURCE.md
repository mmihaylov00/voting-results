# Юли 2021

Official source: https://results.cik.bg/pi2021_07/export.zip
Raw archive is not committed; keep downloaded raw archives local under raw/ when needed.
CIK metadata used: readme_11.07.2021.txt

## Canonical Files
- sections.txt <- sections_11.07.2021.txt
- protocols.txt <- protocols_11.07.2021.txt
- votes.txt <- votes_11.07.2021.txt
- cik_parties.txt <- cik_parties_11.07.2021.txt

## Normalization Notes
- The official CIK files in this archive do not include header rows; canonical headers were added from the bundled readme description.
- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.
- Missing section addresses are stored as empty section names and resolved through the existing settlement/geography fallback logic.

## CIK verification and corrections

Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered fields in its bundled readme. The normalized SHTABO protocol fields had incorrect invalid-vote, no-support, and ballot-type positions. Main protocols are read once; machine supplement no-support counts are added separately.

Party ballot-type splits and nonzero preferences are restored from the original rows. Paper-only protocols assign their votes to paper. Presidential ballot labels use the candidate tickets from `cik_candidates`, rather than sponsor names. Published source inconsistencies are preserved, including differences between totals and their paper/machine components.

Archive SHA-256: `462e1e3813466b321108749206854632061de7672281657a6c526050b25c6f2f`.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6668540;205244;2775754;9342;2948;32253;297812;2477943.
Nonzero preference rows: 359542.
