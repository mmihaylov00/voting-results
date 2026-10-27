# Президентски избори 2021, тур 1

Official source: https://results.cik.bg/pvrns2021/tur1/export.zip
Raw archive is not committed; keep downloaded raw archives local under raw/ when needed.
CIK metadata used: pvr/readme_14.11.2021.txt

## Canonical Files
- sections.txt <- pvr/sections_14.11.2021.txt
- protocols.txt <- pvr/protocols_14.11.2021.txt
- votes.txt <- pvr/votes_14.11.2021.txt
- cik_parties.txt <- pvr/cik_candidates_14.11.2021.txt

## Normalization Notes
- The official CIK files in this archive do not include header rows; canonical headers were added from the bundled readme description.
- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.
- Missing section addresses are stored as empty section names and resolved through the existing settlement/geography fallback logic.
- Presidential candidates are imported as ballot options; preference files are not applicable.

## CIK verification and corrections

Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered fields in its bundled readme. The normalized SHTABO protocol fields had incorrect invalid-vote, no-support, and ballot-type positions. Main protocols are read once; machine supplement no-support counts are added separately.

Party ballot-type splits and nonzero preferences are restored from the original rows. Paper-only protocols assign their votes to paper. Presidential ballot labels use the candidate tickets from `cik_candidates`, rather than sponsor names. Published source inconsistencies are preserved, including differences between totals and their paper/machine components.

Archive SHA-256: `c4e9fa74df8debe4857461b35774dba84fed7635fbc1b301c26d9469111bc1b0`.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6667895;282043;2687307;9487;6320;54466;327690;2361797.
Nonzero preference rows: 0.
