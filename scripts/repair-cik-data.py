"""Rebuild historical tables from the original CIK ZIP and its documented form fields."""

import argparse
import collections
import gzip
import hashlib
import io
import itertools
from pathlib import Path
import zipfile


PROTOCOL_HEADERS = 'sectionId;totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes'
MACHINE_FORMS = {27, 31, 32, 41}
MAIN_FORMS = {24, 25, 26, 28, 29, 30}
DATES = {'2016.11.06', '2016.11.13', '2017.03.26', '2021.04.04',
         '2021.07.11', '2021.11.14', '2021.11.21', '2022.10.02'}


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


def votes(rows, date, forms):
    for parts in rows:
        if date >= '2021.07.11':
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


def repair(archive_path, date, root):
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
