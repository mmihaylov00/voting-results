# Президентски избори 2016, тур 2

Official source: https://results.cik.bg/pvrnr2016/tur2/export.zip
Raw archive is not committed; keep downloaded raw archives local under raw/ when needed.
CIK metadata used: 13.11.2016/readme_13.11.2016.txt

## Canonical Files
- sections.txt <- 13.11.2016/sections_13.11.2016.txt
- protocols.txt <- 13.11.2016/protocols_13.11.2016.txt
- votes.txt <- 13.11.2016/votes_13.11.2016.txt
- cik_parties.txt <- 13.11.2016/cik_candidates_13.11.2016.txt

## Normalization Notes
- The official CIK files in this archive do not include header rows; canonical headers were added from the bundled readme description.
- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.
- Missing section addresses are stored as empty section names and resolved through the existing settlement/geography fallback logic.
- Presidential candidates are imported as ballot options; preference files are not applicable.

## CIK verification and corrections

Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered fields in its bundled readme. The normalized SHTABO protocol fields had incorrect invalid-vote, no-support, and ballot-type positions. Main protocols are read once; machine supplement no-support counts are added separately.

Party ballot-type splits and nonzero preferences are restored from the original rows. Paper-only protocols assign their votes to paper. Presidential ballot labels use the candidate tickets from `cik_candidates`, rather than sponsor names. Published source inconsistencies are preserved, including differences between totals and their paper/machine components.

Archive SHA-256: `ac991f69b277e83f4be43a785cb5f99315e0f92ce283a9340c046c05139be3b8`.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6848311;171808;3540829;66036;151874;3538;3483076;57753.
Nonzero preference rows: 0.
