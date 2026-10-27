# Март 2017

Official source: https://results.cik.bg/pi2017/export.zip
Raw archive is not committed; keep downloaded raw archives local under raw/ when needed.
CIK metadata used: readme_26.03.2017.txt

## Canonical Files
- sections.txt <- sections_26.03.2017.txt
- protocols.txt <- protocols_26.03.2017.txt
- votes.txt <- votes_26.03.2017.txt
- cik_parties.txt <- cik_parties_26.03.2017.txt

## Normalization Notes
- The official CIK files in this archive do not include header rows; canonical headers were added from the bundled readme description.
- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.
- Missing section addresses are stored as empty section names and resolved through the existing settlement/geography fallback logic.

## CIK verification and corrections

Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered fields in its bundled readme. The normalized SHTABO protocol fields had incorrect invalid-vote, no-support, and ballot-type positions. Main protocols are read once; machine supplement no-support counts are added separately.

Party ballot-type splits and nonzero preferences are restored from the original rows. Paper-only protocols assign their votes to paper. Presidential ballot labels use the candidate tickets from `cik_candidates`, rather than sponsor names. Published source inconsistencies are preserved, including differences between totals and their paper/machine components.

Archive SHA-256: `fb3029d0ee8f633c5e5e405aa1da37e8a9bffb67437854cf3b4bd3a555a57afc`.

Canonical protocol totals (totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes): 6838235;166123;3682151;169009;87850;0;3682493;0.
Nonzero preference rows: 312015.
