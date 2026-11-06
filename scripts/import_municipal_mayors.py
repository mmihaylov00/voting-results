#!/usr/bin/env python3
"""Retain 2023 municipal mayor nominees from the two official CIK archives.

This is an election-result baseline, not a register of current officeholders.
No network requests are made. Supply the original first-round and runoff ZIPs.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


OBLAST_PREFIXES = (
    'BLG', 'BGS', 'VAR', 'VTR', 'VID', 'VRC', 'GAB', 'DOB', 'KRZ', 'KNL',
    'LOV', 'MON', 'PAZ', 'PER', 'PVN', 'PDV', 'RAZ', 'RSE', 'SLS', 'SLV',
    'SML', 'SOF', 'SFO', 'SZR', 'TGV', 'HKV', 'SHU', 'JAM',
)
BASE_URL = 'https://results.cik.bg/mi2023'


def municipal_tables(archive_path):
    """Read only the municipality-mayor folder, preserving table hashes."""
    tables = {}
    with ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = entry.filename if entry.flag_bits & 0x800 else entry.filename.encode('cp437').decode('cp866')
            if 'КО' not in Path(name).parts[:-1]:
                continue
            filename = Path(name).name
            if filename in tables:
                raise ValueError(f'Duplicate municipal table: {filename}')
            content = archive.read(entry)
            tables[filename] = {
                'text': content.decode('utf-8-sig'), 'path': name,
                'sha256': hashlib.sha256(content).hexdigest(),
            }
    for filename in ['local_candidates_29.10.2023.txt', 'votes_29.10.2023.txt', 'protocols_29.10.2023.txt']:
        if filename not in tables:
            raise ValueError(f'Missing municipal table: {filename}')
    return tables


def parse_candidates(text):
    result = defaultdict(dict)
    for line_number, line in enumerate(text.splitlines(), 1):
        if not line:
            continue
        fields = line.rstrip(';').split(';')
        if len(fields) < 5 or not fields[0].isdigit() or not fields[2].isdigit():
            raise ValueError(f'Invalid candidate row {line_number}')
        code, label, ballot = fields[:3]
        code = code.zfill(4)
        if len(code) != 4 or not label.startswith(code + '. '):
            raise ValueError(f'Invalid municipality identity at row {line_number}')
        if ballot in result[code]:
            raise ValueError(f'Duplicate candidate: {code}/{ballot}')
        if not fields[-1].strip() or not ';'.join(fields[3:-1]).strip():
            raise ValueError(f'Missing candidate or nominating organization at row {line_number}')
        result[code][ballot] = {
            'name': label[len(code) + 2:], 'party': ';'.join(fields[3:-1]),
            'mayor': fields[-1], 'candidateLine': line_number,
        }
    return dict(result)


def section_rows(text):
    result = {}
    for line in text.splitlines():
        if not line:
            continue
        fields = line.split(';')
        if len(fields) < 3 or fields[0] not in {'24', '26'} or not fields[1].isdigit() or len(fields[1]) != 9:
            raise ValueError('Invalid mayor protocol/vote row')
        if fields[1] in result:
            raise ValueError(f'Duplicate section: {fields[1]}')
        if not fields[2].isdigit():
            raise ValueError(f'Invalid municipality: {fields[1]}')
        result[fields[1]] = fields
    return result


def round_results(tables):
    candidates = parse_candidates(tables['local_candidates_29.10.2023.txt']['text'])
    votes = section_rows(tables['votes_29.10.2023.txt']['text'])
    protocols = section_rows(tables['protocols_29.10.2023.txt']['text'])
    corrections = []
    for filename in sorted(tables):
        if filename.startswith('votes_') and filename != 'votes_29.10.2023.txt':
            protocol_name = filename.replace('votes_', 'protocols_', 1)
            readme_name = filename.replace('votes_', 'readme_', 1)
            if protocol_name not in tables or readme_name not in tables:
                raise ValueError(f'Correction lacks protocols or documentation: {filename}')
            updated_votes = section_rows(tables[filename]['text'])
            updated_protocols = section_rows(tables[protocol_name]['text'])
            if updated_votes.keys() != updated_protocols.keys() or not updated_votes.keys() <= votes.keys():
                raise ValueError(f'Correction section mismatch: {filename}')
            votes.update(updated_votes)
            protocols.update(updated_protocols)
            corrections.append({'votes': filename, 'protocols': protocol_name,
                                'documentation': tables[readme_name]['text'],
                                'sections': sorted(updated_votes)})
    if votes.keys() != protocols.keys():
        raise ValueError('Vote and protocol section coverage differs')
    totals = defaultdict(Counter)
    no_support = Counter()
    discrepancies = []
    for section, fields in votes.items():
        code = fields[2].zfill(4)
        protocol = protocols[section]
        if code not in candidates or protocol[2].zfill(4) != code or protocol[0] != fields[0] \
                or len(protocol) != 21 or (len(fields) - 3) % 4:
            raise ValueError(f'Inconsistent section: {section}')
        seen_ballots = set()
        for offset in range(3, len(fields), 4):
            ballot = fields[offset]
            if ballot not in candidates[code] or ballot in seen_ballots:
                raise ValueError(f'Unregistered or repeated candidate: {section}/{ballot}')
            seen_ballots.add(ballot)
            total, paper, machine = map(int, fields[offset + 1:offset + 4])
            if min(total, paper, machine) < 0 or total != paper + machine:
                raise ValueError(f'Invalid vote components: {section}/{ballot}')
            totals[code][ballot] += total
        paper_no_support, machine_no_support = int(protocol[16]), int(protocol[19] or 0)
        if min(paper_no_support, machine_no_support) < 0:
            raise ValueError(f'Negative no-support count: {section}')
        no_support[code] += paper_no_support + machine_no_support
        published = int(protocol[17]) + int(protocol[20] or 0)
        candidate_sum = sum(int(fields[offset]) for offset in range(4, len(fields), 4))
        if published != candidate_sum:
            discrepancies.append({'sectionId': section, 'protocolCandidateTotal': published,
                                  'candidateRowsTotal': candidate_sum})
    if candidates.keys() != totals.keys():
        raise ValueError('Candidate and vote municipality coverage differs')
    return candidates, totals, no_support, corrections, discrepancies


def winner(totals, no_support, runoff=False):
    ordered = totals.most_common()
    if not ordered or ordered[0][1] <= 0:
        raise ValueError('No unique winning candidate')
    ballot, votes = ordered[0]
    if not runoff and votes * 2 <= sum(totals.values()) + no_support:
        return None
    if len(ordered) > 1 and ordered[0][1] == ordered[1][1]:
        raise ValueError('No unique winning candidate')
    return ballot


def build_snapshot(first_path, second_path, root):
    rounds = []
    provenance = []
    for number, path in [(1, first_path), (2, second_path)]:
        tables = municipal_tables(path)
        candidates, totals, no_support, corrections, discrepancies = round_results(tables)
        rounds.append((candidates, totals, no_support))
        provenance.append({
            'round': number, 'archiveUrl': f'{BASE_URL}/tur{number}/opendata/export.zip',
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'tables': {name: {key: value for key, value in table.items() if key != 'text'}
                       for name, table in sorted(tables.items())},
            'corrections': corrections, 'sourceDiscrepancies': discrepancies,
        })
    first, second = rounds
    if len(first[0]) != 265 or not second[0].keys() <= first[0].keys():
        raise ValueError('Expected 265 first-round municipal elections and a subset of runoffs')
    catalog = {item['obshtina']: item for item in json.loads((root / 'public/municipalities.json').read_text())}
    municipalities = []
    for code, registrations in sorted(first[0].items()):
        number = 2 if code in second[0] else 1
        candidates, totals, no_support = rounds[number - 1]
        ballot = winner(totals[code], no_support[code], runoff=number == 2)
        if ballot is None or (number == 2 and winner(first[1][code], first[2][code]) is not None):
            raise ValueError(f'Majority and runoff coverage disagree: {code}')
        candidate = candidates[code][ballot]
        administrative_code = OBLAST_PREFIXES[int(code[:2]) - 1] + code[2:]
        if administrative_code != 'SOF46' and administrative_code not in catalog:
            raise ValueError(f'Municipality absent from administrative catalog: {administrative_code}')
        catalog_name = catalog.get(administrative_code, {}).get('name', 'Столична')
        if candidate['name'].casefold() != catalog_name.casefold() \
                and (candidate['name'], catalog_name) != ('Добричка', 'Добрич-селска'):
            raise ValueError(f'Municipality code/name mismatch: {administrative_code}')
        municipalities.append({
            'administrativeCode': administrative_code, 'cikCode': code,
            'name': candidate['name'], 'mayor': candidate['mayor'], 'party': candidate['party'],
            'electionDate': '2023-10-29' if number == 1 else '2023-11-05',
            'round': number, 'ballot': ballot, 'votes': totals[code][ballot],
            'validIncludingNoSupport': sum(totals[code].values()) + no_support[code],
            'candidateLine': candidate['candidateLine'],
            'sourceUrl': f'{BASE_URL}/tur{number}/rezultati/{code}.html#t0',
        })
    return {'metadata': {
        'basis': 'Официални резултати за кметове на общини от местните избори през 2023 г.; '
                 'точна номинираща партия, коалиция или инициативен комитет.',
        'electionDate': '2023-10-29 / 2023-11-05',
        'sourceUrl': f'{BASE_URL}/tur1/opendata/index.html',
        'provenance': provenance,
        'limitations': [
            'Това е историческа номинация от 2023 г., не проверка кой е кмет или член на коя партия през 2026 г.',
            'Следващи частични избори, прекратени мандати, временно изпълняващи длъжността и партийни промени не са включени в тази база.',
            'Местните коалиции и инициативните комитети се пазят по точния им регистрационен етикет; не се приписват на национална партия.',
            'Обхватът е кмет на община, а не кмет на район или кметство.',
            'Победителите са възстановени от секционните гласове: над половината действителни гласове с НПН на I тур или единствен най-висок резултат на II тур.',
        ],
    }, 'municipalities': municipalities}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--round1', required=True, type=Path)
    parser.add_argument('--round2', required=True, type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    snapshot = build_snapshot(args.round1, args.round2, args.root)
    output = args.output or args.root / 'public/data/forensics/2026/mayors-2023.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Retained {len(snapshot["municipalities"])} municipal mayor nominations in {output}')


if __name__ == '__main__':
    main()
