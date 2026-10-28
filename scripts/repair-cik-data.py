"""Rebuild canonical election tables from the original CIK ZIP and its documented fields."""

import argparse
import collections
import gzip
import hashlib
import io
import itertools
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import zipfile


PROTOCOL_HEADERS = 'sectionId;totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes'
MACHINE_FORMS = {27, 31, 32, 41}
MAIN_FORMS = {24, 25, 26, 28, 29, 30}
DATES = {'2016.11.06', '2016.11.13', '2017.03.26', '2021.04.04',
         '2021.07.11', '2021.11.14', '2021.11.21', '2022.10.02', '2026.10.25'}
SECTION_HEADERS = 'sectionId;regionId;regionName;municipalityId;cityName;sectionName;lat;lan;isMobile;isShip;machineCount'


def number(value):
    return int(value or 0)


def read_rows(archive, name):
    with archive.open(name) as source:
        for line in io.TextIOWrapper(source, encoding='utf-8-sig'):
            if line.strip():
                yield line.rstrip('\r\n').split(';')


def write_rows(directory, name, header, rows):
    target = directory / (name + '.txt.gz')
    temporary = target.with_suffix('.tmp')
    count = 0
    with temporary.open('wb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding='utf-8', newline='\n') as text:
                text.write(header + '\n')
                for row in rows:
                    text.write(';'.join(map(str, row)) + '\n')
                    count += 1
    temporary.replace(target)
    return count


def protocols(rows, date):
    if date == '2026.10.25':
        return protocols_2026(rows)
    sections = {}
    forms = {}
    machine_no_votes = collections.Counter()
    modern = date >= '2021.07.11'
    shift = 0 if date == '2021.07.11' else 2
    for parts in rows:
        form, section_id = int(parts[0]), parts[1]
        value = lambda position: number(parts[position - 1])
        if modern:
            if form in MACHINE_FORMS:
                machine_no_votes[section_id] += value(17 + shift)
                continue
            if form not in MAIN_FORMS:
                raise ValueError(f'Unknown protocol form {form}')
            paper = form in {24, 26, 28, 30}
            machine = form in {25, 26, 29, 30}
            values = [value(6 + shift), value(7 + shift), value(8 + shift),
                      value(14 + shift) if paper else 0,
                      value(17 + shift) if paper else 0, 0,
                      value(12 + shift) if paper else 0,
                      value(13 + shift) if machine else 0]
        elif date.startswith('2016'):
            if form not in {1, 7, 8}:
                raise ValueError(f'Unknown protocol form {form}')
            values = [value(6), value(7), value(8), value(20),
                      value(28) if form == 8 else value(27),
                      value(29) if form == 8 else 0,
                      value(18) if form == 8 else value(17),
                      value(19) if form == 8 else 0]
        elif date.startswith('2017'):
            if form not in {1, 7}:
                raise ValueError(f'Unknown protocol form {form}')
            values = [value(6), value(7), value(8), value(16), value(19), 0, value(15), 0]
        else:
            if form not in {1, 7, 8}:
                raise ValueError(f'Unknown protocol form {form}')
            values = [value(6), 0, value(7), value(12),
                      value(19) if form == 8 else value(21),
                      value(20) if form == 8 else 0,
                      value(9) if form == 8 else value(11),
                      value(10) if form == 8 else 0]
        if section_id in sections:
            raise ValueError(f'Duplicate main protocol for {section_id}')
        sections[section_id] = [section_id, *values]
        forms[section_id] = form
    for section_id, total in machine_no_votes.items():
        sections[section_id][6] = total
    return sections, forms


def protocols_2026(rows):
    sections, forms = {}, {}
    machine_no_votes = collections.Counter()
    for parts in rows:
        if len(parts) != 28:
            raise ValueError('Expected 28 fields in the October 2026 protocol')
        form, section_id = int(parts[0]), parts[1]
        if not re.fullmatch(r'\d{9}', section_id) or int(section_id[:2]) != int(parts[2]):
            raise ValueError(f'Invalid protocol section or region: {section_id}')
        if any(number(value) < 0 for value in parts[5:]):
            raise ValueError(f'Negative protocol count: {section_id}')
        if form in {32, 41}:
            if any(parts[index - 1] == '' for index in [26, 27, 28]):
                raise ValueError(f'Missing machine counts: {section_id}')
            machine_no_votes[section_id] += number(parts[27])
            continue
        if form not in MAIN_FORMS or section_id in sections:
            raise ValueError(f'Unknown or duplicate main protocol: {form}, {section_id}')
        paper, mixed = form in {24, 26, 28, 30}, form in {26, 30}
        required = [9, 10, 11] + ([12, 13, 17] if paper else [14])
        if mixed:
            required += list(range(18, 26))
        if any(parts[index - 1] == '' for index in required):
            raise ValueError(f'Missing protocol counts: {section_id}')
        value = lambda position: number(parts[position - 1])
        sections[section_id] = [section_id, value(9), value(10), value(11),
            value(13) + value(21) + value(25), value(17), value(20) + value(24),
            value(12), value(14) + value(18) + value(22)]
        forms[section_id] = form
    for section_id, total in machine_no_votes.items():
        if forms.get(section_id) not in {25, 29}:
            raise ValueError(f'Orphan or duplicate machine channel: {section_id}')
        sections[section_id][6] = total
    if any(form in {25, 29} and section_id not in machine_no_votes for section_id, form in forms.items()):
        raise ValueError('Machine-only protocol has no machine supplement')
    return sections, forms


def votes(rows, date, forms):
    for parts in rows:
        if date == '2026.10.25':
            if len(parts) < 8 or (len(parts) - 2) % 6:
                raise ValueError('Invalid October 2026 vote columns')
            section_id, region_id = parts[:2]
            blocks = []
            for index in range(2, len(parts), 6):
                party_id = parts[index]
                total, paper, machine, first, second = map(number, parts[index + 1:index + 6])
                if min(total, paper, machine, first, second) < 0 or total != paper + machine or machine != first + second:
                    raise ValueError(f'Inconsistent vote components: {section_id}, {party_id}')
                blocks.extend([party_id, total, paper, machine])
        elif date >= '2021.07.11':
            form, section_id, region_id = int(parts[0]), parts[1], parts[2]
            if form not in MACHINE_FORMS | {24, 26, 28, 30}:
                raise ValueError(f'Unknown vote form {form}')
            blocks = []
            for index in range(3, len(parts), 2):
                party_id, total = parts[index], number(parts[index + 1])
                blocks.extend([party_id, total, 0 if form in MACHINE_FORMS else total,
                               total if form in MACHINE_FORMS else 0])
        else:
            section_id, region_id = parts[:2]
            stride = 5 if date.startswith('2016') else 3 if date.startswith('2017') else 4
            blocks = []
            for index in range(2, len(parts), stride):
                party_id, total = parts[index], number(parts[index + 1])
                paper = number(parts[index + 2]) if stride >= 4 else total
                machine = number(parts[index + 3]) if stride >= 4 else 0
                if forms[section_id] in {1, 7}:
                    paper, machine = total, 0
                blocks.extend([party_id, total, paper, machine])
        yield [section_id, region_id, *blocks]


def preferences(rows, date, forms):
    for parts in rows:
        if date >= '2021.07.11':
            form, section_id, party_id, preference, total = parts
            total = number(total)
            if int(form) not in MACHINE_FORMS | {24, 26, 28, 30}:
                raise ValueError(f'Unknown preference form {form}')
            paper, machine = (0, total) if int(form) in MACHINE_FORMS else (total, 0)
        else:
            section_id, party_id, preference = parts[:3]
            total = number(parts[3])
            paper = number(parts[4]) if len(parts) > 4 else total
            machine = number(parts[5]) if len(parts) > 5 else 0
            if forms[section_id] in {1, 7}:
                paper, machine = total, 0
        if preference not in {'Без', '0', 'Общ брой'} and (paper or machine):
            yield [int(section_id[:2]), section_id, party_id, preference, total, paper, machine]


def sections_2026(rows):
    sections = {}
    for parts in rows:
        if len(parts) < 11:
            raise ValueError('Missing section geography fields')
        section_id, region_id, region_name, ekatte, city = parts[:5]
        if not re.fullmatch(r'\d{9}', section_id) or int(section_id[:2]) != int(region_id) or not 1 <= int(region_id) <= 32:
            raise ValueError(f'Invalid section or region: {section_id}')
        if section_id in sections or not re.fullmatch(r'\d{5,6}', ekatte):
            raise ValueError(f'Duplicate section or invalid EKATTE: {section_id}')
        longitude, latitude, mobile, ship, machines = parts[-5:]
        if bool(longitude) != bool(latitude):
            raise ValueError(f'Incomplete coordinates: {section_id}')
        if longitude and (not math.isfinite(float(longitude)) or not math.isfinite(float(latitude))
                          or not -180 <= float(longitude) <= 180 or not -90 <= float(latitude) <= 90):
            raise ValueError(f'Invalid coordinates: {section_id}')
        if mobile not in {'0', '1'} or ship not in {'0', '1'} or machines not in {'0', '1', '2'}:
            raise ValueError(f'Invalid section flags: {section_id}')
        # Some official addresses contain unescaped semicolons; geography is always the last five fields.
        address = ','.join(parts[5:-5]).rstrip(',')
        region_name = 'Чужбина' if region_id == '32' else re.sub(r'^\d+\.\s*', '', region_name)
        sections[section_id] = [section_id, region_id, region_name, ekatte, city, address,
                                longitude, latitude, mobile, ship, machines]
    return sections


def repair_official_2026(archive_path, root):
    date = '2026.10.25'
    catalog_path = root / 'src/assets/elections.json'
    catalog = json.loads(catalog_path.read_text())
    entries = [item for item in catalog if item['date'] == date]
    if len(entries) != 1 or entries[0].get('type') != 'presidential' or entries[0].get('round') != 1:
        raise ValueError('Expected the registered October 2026 presidential first round')
    with zipfile.ZipFile(archive_path) as archive:
        def source(name):
            matches = [item for item in archive.namelist() if item.rsplit('/', 1)[-1] == f'{name}_25.10.2026.txt']
            if len(matches) != 1:
                raise ValueError(f'Missing or duplicate official source: {name}')
            return list(read_rows(archive, matches[0]))
        readme = source('readme')
        if 'ПРЕЗИДЕНТ' not in str(readme) or '10.2026' not in str(readme):
            raise ValueError('Unexpected election in the official archive readme')
        sections = sections_2026(source('sections'))
        protocol_rows, forms = protocols(source('protocols'), date)
        vote_rows = list(votes(source('votes'), date, forms))
        candidates = source('cik_candidates')
        if any(len(row) != 4 or row[2] != '1' or not row[3].strip() for row in candidates):
            raise ValueError('Invalid presidential candidate tickets')
        parties = {row[0]: row[3] for row in candidates}
        if len(parties) != len(candidates) or set(parties) != set(map(str, range(1, 28))):
            raise ValueError('Unexpected presidential ballot options')
        if not sections or set(sections) != set(protocol_rows) or len(vote_rows) != len(sections):
            raise ValueError('Section, protocol and vote coverage differ')
        seen = set()
        for row in vote_rows:
            section_id, region_id = row[:2]
            ids = row[2::4]
            if section_id not in sections or section_id in seen or region_id != sections[section_id][1]:
                raise ValueError(f'Unknown or duplicate vote section: {section_id}')
            if len(ids) != len(parties) or set(ids) != set(parties):
                raise ValueError(f'Incomplete candidate votes: {section_id}')
            seen.add(section_id)
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    totals = [sum(row[index] for row in protocol_rows.values()) for index in range(1, 9)]
    directory = Path(tempfile.mkdtemp(prefix=f'.{date}-official-', dir=root / 'public/data'))
    destination = root / 'public/data' / date
    backup = destination.with_name(f'.{date}-previous-{os.getpid()}')
    temporary_catalog = catalog_path.with_suffix('.json.cik-import')
    moved = False
    try:
        write_rows(directory, 'sections', SECTION_HEADERS, sections.values())
        write_rows(directory, 'protocols', PROTOCOL_HEADERS, protocol_rows.values())
        write_rows(directory, 'votes', 'sectionId;regionId' + ';partyId;total;paper;machine' * len(parties), vote_rows)
        write_rows(directory, 'cik_parties', 'partyId;partyName', parties.items())
        (directory / 'SOURCE.md').write_text(
            '# Official presidential results, 25 October 2026, round 1\n\n'
            'Source: https://results.cik.bg/pvr202610/opendata/export.zip\n\n'
            'Final updated database approved by CIK Decision 416-ПВР of 27 October 2026: '
            'https://www.cik.bg/bg/decisions/416/2026-10-27\n\n'
            f'Archive SHA-256: `{digest}`.\n\n'
            f'Reproduce with `python3 scripts/repair-cik-data.py {date} /path/to/export.zip`. '
            'The numbered fields below follow the bundled `readme_25.10.2026.txt`.\n\n'
            '- Main forms 24-26 and 28-30: electors, added electors and signed voters use fields 9-11. '
            'Paper ballots, invalid paper votes and paper no-support votes use fields 12, 13 and 17.\n'
            '- Machine-only forms 25/29 use field 14 for confirmed machine votes and sum no-support '
            'field 28 from their machine supplements 32/41.\n'
            '- Mixed forms 26/30 use receipt fields 18+22, no-support fields 20+24 and unreadable '
            'receipt fields 21+25. Unreadable receipts remain included in machine cast counts and invalid votes.\n'
            '- Vote rows preserve total, paper and combined machine votes from each six-field candidate block. '
            'Machine 1/2 subtotals are checked against the combined machine total. Ticket names use `cik_candidates`.\n'
            '- Official section EKATTE, coordinates and flags replace the inferred page geography. '
            'Unescaped semicolons in addresses become commas; the last five fields retain coordinates and flags. '
            'Region number prefixes are removed and region 32 is labelled Чужбина.\n\n'
            f'Sections: {len(sections)}. Sections without coordinates: '
            f'{sum(not row[6] for row in sections.values())}. No presidential preferences apply.\n\n'
            f'Canonical protocol totals ({PROTOCOL_HEADERS.split(";", 1)[1]}): '
            + ';'.join(map(str, totals)) + '.\n', encoding='utf-8')
        entries[0].pop('provisional', None)
        temporary_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
        destination.rename(backup)
        try:
            directory.rename(destination)
            moved = True
            temporary_catalog.replace(catalog_path)
        except Exception:
            if moved:
                shutil.rmtree(destination)
            backup.rename(destination)
            raise
        shutil.rmtree(backup)
    finally:
        temporary_catalog.unlink(missing_ok=True)
        if directory.exists():
            shutil.rmtree(directory)
    print(f'{date}: official data, {len(sections)} sections, protocol totals {totals}')


def repair(archive_path, date, root):
    if date == '2026.10.25':
        return repair_official_2026(archive_path, root)
    directory = root / 'public/data' / date
    if not directory.is_dir():
        raise ValueError(f'Import SHTABO data first: {directory}')
    with zipfile.ZipFile(archive_path) as archive:
        source_date = '.'.join(reversed(date.split('.')))
        prefix = 'pvr/' if date == '2021.11.14' else 'np/' if date == '2022.10.02' else ''
        if date.startswith('2016'):
            prefix = source_date + '/'
        filename = lambda name: f'{prefix}{name}_{source_date}.txt'
        section_rows, forms = protocols(read_rows(archive, filename('protocols')), date)
        write_rows(directory, 'protocols', PROTOCOL_HEADERS, section_rows.values())
        vote_rows = votes(read_rows(archive, filename('votes')), date, forms)
        first = next(vote_rows)
        header = 'sectionId;regionId' + ';partyId;total;paper;machine' * ((len(first) - 2) // 4)
        write_rows(directory, 'votes', header, itertools.chain([first], vote_rows))
        candidate_file = filename('cik_candidates')
        if candidate_file in archive.namelist() and date in {'2016.11.06', '2016.11.13', '2021.11.14', '2021.11.21'}:
            write_rows(directory, 'cik_parties', 'partyId;partyName',
                       ([row[0], row[3]] for row in read_rows(archive, candidate_file)))
        preference_file = filename('preferences')
        preference_count = 0
        if preference_file in archive.namelist():
            preference_count = write_rows(directory, 'preferences',
                'regionId;sectionId;partyId;preference;col4;paper;machine',
                preferences(read_rows(archive, preference_file), date, forms))
        totals = [sum(row[index] for row in section_rows.values()) for index in range(1, 9)]
        digest = hashlib.sha256()
        with archive_path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
        provenance = directory / 'SOURCE.md'
        original = provenance.read_text().partition('\n## CIK verification and corrections\n')[0]
        original = original.replace(
            '- Historical party vote rows without per-party paper/machine columns use total votes with paper=0 and machine=0; protocol-level paper/machine totals are preserved when inferable from the protocol form.',
            '- Party paper/machine splits are restored from the original vote form or explicit ballot-type columns; paper-only forms contribute to paper votes.')
        if date in {'2021.11.14', '2021.11.21'}:
            original = original.replace(f'cik_parties_{source_date}.txt',
                                        f'cik_candidates_{source_date}.txt')
        provenance.write_text(original.rstrip() + '\n\n## CIK verification and corrections\n\n'
            'Rebuilt with `scripts/repair-cik-data.py` from the original CIK ZIP, using the numbered '
            'fields in its bundled readme. The normalized SHTABO protocol fields had incorrect '
            'invalid-vote, no-support, and ballot-type positions. Main protocols are read once; '
            'machine supplement no-support counts are added separately.\n\n'
            'Party ballot-type splits and nonzero preferences are restored from the original rows. '
            'Paper-only protocols assign their votes to paper. Presidential ballot labels use '
            'the candidate tickets from `cik_candidates`, rather than sponsor names. '
            'Published source inconsistencies are preserved, including differences between totals '
            'and their paper/machine components.\n\n'
            f'Archive SHA-256: `{digest.hexdigest()}`.\n\n'
            f'Canonical protocol totals ({PROTOCOL_HEADERS.split(";", 1)[1]}): '
            + ';'.join(map(str, totals)) + '.\n'
            f'Nonzero preference rows: {preference_count}.\n')
        print(f'{date}: {len(section_rows)} sections, {preference_count} preference rows, protocol totals {totals}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('date', choices=sorted(DATES))
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    repair(args.archive, args.date, Path(__file__).resolve().parent.parent)
