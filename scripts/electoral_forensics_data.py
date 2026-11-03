"""Auditable section panel for the 2026 presidential electoral-forensics reports.

This module only reads source data. It does not impute missing results, infer a
voting method from a zero machine count, or merge political registrations.
"""

from collections import Counter, defaultdict
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import unicodedata
import zipfile


ANALYSIS_DATES = ('2026.04.19', '2026.10.25', '2026.11.01', '2024.10.27')
FIRST_ROUND = '2026.10.25'
SECOND_ROUND = '2026.11.01'
PRIORITY_REGIONS = {'5': 'Видин', '6': 'Враца', '12': 'Монтана', '19': 'Русе'}
SOURCE_BASES = {
    '2026.04.19': 'https://results.cik.bg/pe202604/',
    FIRST_ROUND: 'https://results.cik.bg/pvr202610/',
    SECOND_ROUND: 'https://results.cik.bg/pvr202610/tur2/',
    '2024.10.27': 'https://results.cik.bg/pe202410/',
}
EVIDENCE_DIRECTORY = Path('public/data/forensics/2026/input-evidence')
INSTITUTION_REVIEW_PATTERN = re.compile(
    r'ПОДВИЖН|ПСИК|БОЛНИЦ|МБАЛ|УМБАЛ|ЗАТВОР|АРЕСТ|'
    r'(?<![А-Я])(?:ДСХ|ДПХ|ДПБ|ЦНСТ[А-Я]*|СБАЛ[А-Я]*|СБПЛББ|СБР)(?![А-Я])|'
    r'СТАРЧЕСКИ\s+ДОМ|ДОМ(?:А)?\s+ЗА\s+(?:СТАРИ|ПЪЛНОЛЕТНИ|ЛИЦА)|'
    r'ОНКОЛОГИЧЕН\s+ЦЕНТЪР|ЦЕНТЪР\s+ЗА\s+ПСИХИЧНО\s+ЗДРАВЕ'
)
DEFINITIONS = {
    'registered': 'totalA: избиратели по списъка при предаването му на СИК. Дописаните в изборния ден '
                  'избиратели (totalB) се пазят отделно.',
    'turnout': '100 × гласували / totalA. Може да надхвърли 100% при дописани в изборния ден избиратели.',
    'turnoutWithAdded': 'Проверка с алтернативен знаменател: 100 × гласували / (totalA + totalB).',
    'share': '100 × гласове за листата / сбор на гласовете за всички кандидатски или партийни листи. '
             '„Не подкрепям никого“ не влиза в този знаменател.',
    'shareOfValidIncludingNoSupport': '100 × гласове за листата / (гласове за всички листи + „Не подкрепям никого“).',
    'sizeGroup': 'Групиране само по totalA: под 300; от 300 до 400 включително; от 401 до 700 включително; над 700.',
    'matching': 'Изискват се еднакви секционен номер, област, община, ЕКАТТЕ, населено място и адрес. '
                'Уеднаквяват се само пунктуация, главни/малки букви и интервали. Променените секции '
                'не участват в сравненията между избори. ЕКАТТЕ за балотажа е пренесен от първия тур '
                'или определен чрез административния каталог и не е независимо потвърждение от ЦИК.',
    'possibleSplitMerge': 'Променен или липсващ номер на същия адрес и в същото населено място е основание '
                          'за проверка на протоколите, а не доказателство за разделена или слята секция.',
    'votingMethod': 'Методът се определя от официалния вид протокол и изричните секционни флагове, '
                    'без да се извежда от броя машинни гласове. Парламентарният смесен протокол допуска '
                    'хартия и машина; президентският протокол за преустановена машина се пази отделно. '
                    'Без достатъчно данни методът остава неизвестен.',
    'geography': 'В проверените архиви ЕКАТТЕ е официално поле. За балотажа кодът е пренесен от първия '
                 'тур или изведен чрез административния каталог. Липсващи общински имена в старите '
                 'таблици се допълват от същия каталог. Координатите описват '
                 'изборно помещение или център на населено място, а не местоположение на избиратели '
                 'или доказана териториална съседност.',
    'runoffEkatte': 'Публикуваните страници за балотажа не съдържат независимо секционно ЕКАТТЕ. '
                   'Каноничният импорт го пренася от официалния първи тур при еднакъв секционен номер '
                   'и еднакво изписано населено място след уеднаквяване на интервали и главни/малки букви. '
                   'Останалите случаи се разрешават чрез административния каталог. Съвпадението на този '
                   'код е проверка за вътрешна съгласуваност, а не отделно потвърждение на секционната идентичност.',
}


def normalize_identity(value):
    """Ignore typographic formatting without discarding words, letters or numbers."""
    value = unicodedata.normalize('NFKC', str(value or '')).casefold()
    return ''.join(character for character in value if character.isalnum())


def percentage(numerator, denominator):
    return 100.0 * numerator / denominator if denominator > 0 else None


def size_group(registered):
    if registered < 300:
        return 'under300'
    if registered <= 400:
        return '300to400'
    if registered <= 700:
        return '401to700'
    return 'over700'


def _integer(value):
    if value == '':
        return 0
    if not re.fullmatch(r'\d+', str(value)):
        raise ValueError(f'Invalid non-negative source count: {value!r}')
    return int(value)


def _table(root, date, name, required=True):
    directory = root / 'public/data' / date
    paths = [path for path in (directory / f'{name}.txt', directory / f'{name}.txt.gz') if path.exists()]
    if not paths and not required:
        return None
    if len(paths) != 1:
        raise ValueError(f'Expected one source table: {date}/{name}')
    path = paths[0]
    stored = path.read_bytes()
    content = gzip.decompress(stored) if path.suffix == '.gz' else stored
    lines = content.decode('utf-8-sig').splitlines()
    if not lines:
        raise ValueError(f'Empty source table: {path}')
    return {'header': lines[0].split(';'),
            'rows': [(number, line.split(';')) for number, line in enumerate(lines[1:], 2) if line.strip()],
            'path': path.relative_to(root).as_posix(), 'url': '/data/' + date + '/' + path.name,
            'sha256': hashlib.sha256(stored).hexdigest(),
            'contentSha256': hashlib.sha256(content).hexdigest()}


def _reference(table, line):
    return {'path': table['path'], 'url': table['url'], 'line': line,
            'sha256': table['sha256'], 'contentSha256': table['contentSha256']}


def _indexed(table, key='sectionId'):
    index = table['header'].index(key)
    rows = {}
    for line, values in table['rows']:
        identifier = values[index]
        if identifier in rows:
            raise ValueError(f'Duplicate {key}: {identifier} in {table["path"]}:{line}')
        rows[identifier] = (line, values)
    return rows


def _assignment(text, name):
    match = re.search(rf'\b{re.escape(name)}\s*=\s*', text)
    if not match:
        raise ValueError(f'Missing official JavaScript assignment: {name}')
    return json.JSONDecoder().raw_decode(text[match.end():])[0]


def _method(form, date):
    if form in {24, 28, 36, 44}:
        return 'paper'
    if form in {25, 29, 37, 45}:
        return 'machine'
    if form in {26, 30, 33, 43}:
        return 'interrupted' if date in {FIRST_ROUND, SECOND_ROUND} else 'machine'
    return 'unknown'


def _inventory_methods(path, date):
    stored = path.read_bytes()
    content = gzip.decompress(stored) if path.suffix == '.gz' else stored
    text = content.decode('utf-8-sig')
    inventory = _assignment(text, 'HAS_PROTO')
    forms = _assignment(text, 'PROTO_FORMS')
    digest = hashlib.sha256(content).hexdigest()
    methods = {}
    for region, rows in inventory['256'].items():
        for suffix, versions in rows.items():
            if suffix.startswith('ik'):
                continue
            section_id = region + suffix.zfill(7)
            version = '0' if '0' in versions else '1'
            form = int(versions[version])
            methods[section_id] = {
                'form': form, 'formLabel': forms.get(str(form)),
                'method': _method(form, date), 'sourceUrl': SOURCE_BASES[date] + 'protokoli/data.js',
                'protocolUrl': SOURCE_BASES[date] + f'protokoli/256/{region}/{section_id}.{version}.html',
                'sha256': digest, 'pointer': f'HAS_PROTO/256/{region}/{suffix}/{version}',
                'evidenceType': 'official_protocol_inventory',
            }
    return methods, {'path': str(path), 'sourceUrl': SOURCE_BASES[date] + 'protokoli/data.js',
                     'sha256': digest, 'kind': 'official_protocol_inventory'}


def _archive_methods(path, date, source_url=None):
    source_date = '.'.join(reversed(date.split('.')))
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.rsplit('/', 1)[-1] == f'protocols_{source_date}.txt']
        if len(names) != 1:
            raise ValueError(f'Missing unique official protocol source in {path}')
        content = archive.read(names[0])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    methods = {}
    for line, text in enumerate(content.decode('utf-8-sig').splitlines(), 1):
        values = text.split(';')
        if len(values) < 2 or not values[0].isdigit() or int(values[0]) not in {24, 25, 26, 28, 29, 30}:
            continue
        form, section_id = int(values[0]), values[1]
        if section_id in methods:
            raise ValueError(f'Duplicate official main protocol: {section_id}')
        methods[section_id] = {'form': form, 'method': _method(form, date),
                               'sourceUrl': source_url or SOURCE_BASES[date] + 'opendata/export.zip',
                               'member': names[0], 'line': line, 'sha256': digest, 'rawValues': values,
                               'evidenceType': 'official_archive_protocol_form'}
        if date in {FIRST_ROUND, SECOND_ROUND}:
            methods[section_id]['protocolUrl'] = SOURCE_BASES[date] + f'protokoli/256/{section_id[:2]}/{section_id}.1.html'
    return methods, {'path': str(path), 'sourceUrl': source_url or SOURCE_BASES[date] + 'opendata/export.zip',
                     'sha256': digest, 'kind': 'official_archive_protocol_form'}


def _archive_tables(path, date):
    """Read only dated official text members, without extracting the archive."""
    source_date = '.'.join(reversed(date.split('.')))
    tables = {}
    with zipfile.ZipFile(path) as archive:
        for name in ['sections', 'protocols', 'votes', 'cik_parties', 'cik_candidates', 'local_candidates']:
            candidates = [member for member in archive.namelist()
                          if member.rsplit('/', 1)[-1] == f'{name}_{source_date}.txt']
            if not candidates:
                continue
            if len(candidates) != 1:
                raise ValueError(f'Ambiguous dated official source: {name}, {path}')
            member = candidates[0]
            content = archive.read(member)
            rows = [line.split(';') for line in content.decode('utf-8-sig').splitlines() if line.strip()]
            tables[name] = {'member': member, 'rows': rows, 'sha256': hashlib.sha256(content).hexdigest()}
    return tables


def _normalized_source_value(value):
    value = str(value).strip()
    return str(int(value)) if value.isdigit() else ' '.join(value.split())


def _row_counter(rows):
    return Counter(tuple(_normalized_source_value(value) for value in row) for row in rows)


def verify_official_archive(root, date, path, source_url=None):
    """Verify canonical electoral values against one explicitly selected CIK ZIP.

    The final presidential normalization reuses the existing official importer.
    Recent parliamentary canonical rows preserve the original CIK layout, so
    those electoral tables can be compared directly, independent of row order.
    Returns mismatch counts instead of silently selecting a historical version.
    """
    root, path = Path(root), Path(path)
    original = _archive_tables(path, date)
    expected = {}
    if date == FIRST_ROUND:
        specification = importlib.util.spec_from_file_location('cik_official_repair', root / 'scripts/repair-cik-data.py')
        repair = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(repair)
        protocols, forms = repair.protocols_2026(original['protocols']['rows'])
        expected['protocols'] = list(protocols.values())
        expected['votes'] = list(repair.votes(original['votes']['rows'], date, forms))
        expected['sections'] = list(repair.sections_2026(original['sections']['rows']).values())
        expected['cik_parties'] = [[row[0], row[3]] for row in original['cik_candidates']['rows']]
    else:
        for name in ['sections', 'protocols', 'votes', 'cik_parties', 'local_candidates']:
            if name in original:
                expected[name] = original[name]['rows']
    if not expected or not {'protocols', 'votes', 'cik_parties'} <= set(expected):
        raise ValueError(f'Archive lacks the required dated electoral tables: {path}')
    checks = {}
    for name, expected_rows in expected.items():
        canonical = _table(root, date, name, required=False)
        if canonical is None:
            checks[name] = {'matched': False, 'reason': 'canonical_table_missing'}
            continue
        observed = _row_counter(values for _, values in canonical['rows'])
        source = _row_counter(expected_rows)
        missing, extra = source - observed, observed - source
        checks[name] = {'matched': not missing and not extra, 'canonicalRows': sum(observed.values()),
                        'officialRows': sum(source.values()), 'missingRows': sum(missing.values()),
                        'extraRows': sum(extra.values()), 'canonicalSha256': canonical['sha256']}
    return {'status': 'verified' if all(check['matched'] for check in checks.values()) else 'mismatch',
            'date': date, 'sourceUrl': source_url or SOURCE_BASES[date] + 'opendata/export.zip',
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'tables': checks,
            'members': {name: {'member': table['member'], 'sha256': table['sha256'], 'rows': len(table['rows'])}
                        for name, table in original.items()}}


def retain_input_evidence(root, date, archive=None, inventory_path=None, source_url=None, label=None):
    """Explicitly retain compact original evidence and its pinned verification.

    Full ZIPs remain at their official URLs. The original presidential protocol
    text and runoff inventory are small enough to keep with the report inputs.
    """
    root = Path(root)
    directory = root / EVIDENCE_DIRECTORY
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'schemaVersion': 1, 'elections': {}}
    entry = {'date': date, 'label': label}
    if archive:
        archive = Path(archive)
        verification = verify_official_archive(root, date, archive, source_url)
        if verification['status'] != 'verified':
            raise ValueError(f'Cannot pin mismatched official archive: {verification}')
        entry['verification'] = verification
        if date == FIRST_ROUND:
            tables = _archive_tables(archive, date)
            member = tables['protocols']['member']
            with zipfile.ZipFile(archive) as original:
                content = original.read(member)
            filename = date + '.official-protocols.txt.gz'
            stored = gzip.compress(content, mtime=0)
            (directory / filename).write_bytes(stored)
            entry['methodEvidence'] = {'kind': 'official_archive_protocol_text', 'file': filename,
                                      'sourceUrl': verification['sourceUrl'], 'archiveMember': member,
                                      'archiveSha256': verification['sha256'],
                                      'sha256': hashlib.sha256(stored).hexdigest(),
                                      'contentSha256': hashlib.sha256(content).hexdigest()}
    if inventory_path:
        content = Path(inventory_path).read_bytes()
        _assignment(content.decode('utf-8-sig'), 'HAS_PROTO')
        filename = date + '.protocol-inventory.js.gz'
        stored = gzip.compress(content, mtime=0)
        (directory / filename).write_bytes(stored)
        entry['methodEvidence'] = {'kind': 'official_protocol_inventory', 'file': filename,
                                  'sourceUrl': source_url or SOURCE_BASES[date] + 'protokoli/data.js',
                                  'sha256': hashlib.sha256(stored).hexdigest(),
                                  'contentSha256': hashlib.sha256(content).hexdigest()}
    manifest['elections'][date] = entry
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return entry


def _retained_evidence(root, date):
    directory = root / EVIDENCE_DIRECTORY
    manifest = directory / 'manifest.json'
    if not manifest.exists():
        return {}, None
    entry = json.loads(manifest.read_text())['elections'].get(date)
    if not entry:
        return {}, None
    verification = entry.get('verification')
    if verification:
        for name, check in verification['tables'].items():
            if _table(root, date, name)['sha256'] != check['canonicalSha256']:
                raise ValueError(f'Canonical table changed after official verification: {date}/{name}')
    evidence = entry.get('methodEvidence')
    if not evidence:
        return {}, entry
    path = directory / evidence['file']
    if path.parent != directory or not path.exists():
        raise ValueError(f'Missing retained official method evidence: {date}')
    stored = path.read_bytes()
    content = gzip.decompress(stored)
    if hashlib.sha256(stored).hexdigest() != evidence['sha256'] or hashlib.sha256(content).hexdigest() != evidence['contentSha256']:
        raise ValueError(f'Retained official method evidence hash mismatch: {date}')
    if evidence['kind'] == 'official_protocol_inventory':
        methods, _ = _inventory_methods(path, date)
    else:
        methods = {}
        for line, text in enumerate(content.decode('utf-8-sig').splitlines(), 1):
            values = text.split(';')
            if not values[0].isdigit() or int(values[0]) not in {24, 25, 26, 28, 29, 30}:
                continue
            form, section_id = int(values[0]), values[1]
            if section_id in methods:
                raise ValueError(f'Duplicate retained official main protocol: {section_id}')
            methods[section_id] = {'form': form, 'method': _method(form, date),
                                   'sourceUrl': evidence['sourceUrl'], 'member': evidence['archiveMember'],
                                   'line': line, 'sha256': evidence['archiveSha256'], 'rawValues': values,
                                   'evidenceType': 'retained_official_archive_protocol_form'}
            if date in {FIRST_ROUND, SECOND_ROUND}:
                methods[section_id]['protocolUrl'] = SOURCE_BASES[date] + f'protokoli/256/{section_id[:2]}/{section_id}.1.html'
    for method in methods.values():
        method['retainedSourceUrl'] = '/' + path.relative_to(root / 'public').as_posix()
        method['contentSha256'] = evidence['contentSha256']
    return methods, entry


def _archive_config(archives, date):
    entry = archives.get(date)
    if not entry:
        return None
    return {'path': Path(entry['path']), **{key: value for key, value in entry.items() if key != 'path'}} if isinstance(entry, dict) else {'path': Path(entry)}


def _method_sources(root, date, cache_dirs, archives):
    archive = _archive_config(archives, date)
    if archive:
        if not archive['path'].exists():
            raise ValueError(f'Configured official archive is missing: {archive["path"]}')
        return _archive_methods(archive['path'], date, archive.get('sourceUrl'))
    retained_methods, entry = _retained_evidence(root, date)
    if retained_methods:
        source = dict(entry['methodEvidence'])
        source['path'] = (EVIDENCE_DIRECTORY / source['file']).as_posix()
        return retained_methods, source
    local = root / 'public/data' / date / 'protocol-inventory.js'
    candidates = [local]
    if date in cache_dirs:
        candidates.append(Path(cache_dirs[date]) / 'protokoli/data.js')
    for path in candidates:
        if path.exists():
            return _inventory_methods(path, date)
    return {}, None


def _geography_catalog(root):
    settlements = json.loads((root / 'public/settlements.json').read_text())
    municipalities = json.loads((root / 'public/municipalities.json').read_text())
    return ({item['ekatte']: item for item in settlements},
            {item['obshtina']: item for item in municipalities})


def _section(values, header, settlements, municipalities):
    # The source sometimes includes unescaped semicolons in an address. The
    # first five and trailing geography/flag columns retain their positions.
    address_end = len(values) - (len(header) - 6)
    repaired = values[:5] + [';'.join(values[5:address_end])] + values[address_end:]
    row = dict(zip(header, repaired))
    section_id = row['sectionId']
    if not re.fullmatch(r'\d{9}', section_id):
        raise ValueError(f'Invalid section ID: {section_id}')
    region = str(int(row['regionId']))
    if int(section_id[:2]) != int(region):
        raise ValueError(f'Section and region disagree: {section_id}')
    ekatte = row.get('municipalityId', '')
    ekatte = ekatte.zfill(5) if region != '32' and ekatte.isdigit() else ekatte
    settlement = settlements.get(ekatte, {}) if region != '32' else {}
    municipality = municipalities.get(settlement.get('obshtina'), {})
    city = row.get('cityName', '')
    rural = city.strip().casefold().startswith('с.') or settlement.get('t_v_m') == 'с.'
    if not city.strip().casefold().startswith(('с.', 'гр.')) and not settlement.get('t_v_m'):
        rural = None
    point = None
    if row.get('lat') and row.get('lan'):
        longitude, latitude = float(row['lat']), float(row['lan'])
        if not math.isfinite(longitude) or not math.isfinite(latitude) or not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            raise ValueError(f'Invalid official coordinates: {section_id}')
        point = {'longitude': longitude, 'latitude': latitude}
    special_reasons = []
    for field, label in [('isMobile', 'official_mobile_flag'), ('isShip', 'official_ship_flag')]:
        if row.get(field) == '1':
            special_reasons.append(label)
    # Explicit institution names are leads for protocol review, not inferred
    # legal section categories. They remain distinct from official flags.
    institution = bool(INSTITUTION_REVIEW_PATTERN.search(row.get('sectionName', '').upper()))
    return {
        'sectionId': section_id, 'regionId': region,
        'regionName': re.sub(r'^\d+\.\s*', '', row.get('regionName', '')),
        'municipalityCode': section_id[:4],
        'municipalityName': row.get('municipalityName') or municipality.get('name') or '',
        'municipalityNameSource': 'election_record' if row.get('municipalityName') else
                                  'administrative_catalog' if municipality.get('name') else 'missing',
        'settlementEkatte': ekatte, 'settlementName': city,
        'address': row.get('sectionName', ''), 'rural': rural,
        'coordinates': point, 'special': bool(special_reasons),
        'specialReasons': special_reasons, 'institutionReviewFlag': institution,
        'sectionFlags': {key: row[key] for key in ['isMobile', 'isShip', 'machineCount'] if key in row},
    }


def _party_names(parties, local_candidates):
    names = {values[0]: values[1] for _, values in parties['rows']}
    regional = {}
    if local_candidates:
        for _, values in local_candidates['rows']:
            regional[(str(int(values[0])), values[2])] = values[3]
    return names, regional


def _votes(values, header, parties, regional_parties, region, voted, no_support, date):
    start = header.index('partyId')
    stride = header.index('partyId', start + 1) - start if header.count('partyId') > 1 else len(header) - start
    if (len(values) - start) % stride:
        raise ValueError(f'Invalid repeated vote block: {date}/{values[:3]}')
    totals, flags = {}, []
    for offset in range(start, len(values), stride):
        ballot = values[offset]
        total, paper, machine = map(_integer, values[offset + 1:offset + 4])
        machine_first, machine_second = machine, _integer(values[offset + 4]) if stride == 5 else 0
        machine += machine_second
        if ballot in totals:
            raise ValueError(f'Duplicate ballot registration: {date}/{values[:3]}/{ballot}')
        name = parties.get(ballot, regional_parties.get((region, ballot)))
        if name is None:
            raise ValueError(f'Missing official ballot identity: {date}/{region}/{ballot}')
        if total != paper + machine:
            flags.append('candidate_components_disagree:' + ballot)
        registration_id = date + ':' + ballot if ballot in parties else date + ':' + region + ':' + ballot
        totals[ballot] = {'id': ballot, 'name': name, 'registrationId': registration_id,
                          'total': total, 'paper': paper, 'machine': machine,
                          'machineFirst': machine_first, 'machineSecond': machine_second}
    total_candidate_votes = sum(value['total'] for value in totals.values())
    for value in totals.values():
        value.update(share=percentage(value['total'], total_candidate_votes),
                     shareOfValidLists=percentage(value['total'], total_candidate_votes),
                     shareOfValidIncludingNoSupport=percentage(value['total'], total_candidate_votes + no_support),
                     shareOfVoters=percentage(value['total'], voted))
    return totals, total_candidate_votes, flags


def load_election(root, date, settlements, municipalities, cache_dirs=None, archives=None):
    """Read one canonical election while keeping every source row and identity."""
    root = Path(root)
    tables = {name: _table(root, date, name) for name in ['sections', 'protocols', 'votes', 'cik_parties']}
    local_candidates = _table(root, date, 'local_candidates', required=False)
    parties, regional_parties = _party_names(tables['cik_parties'], local_candidates)
    protocol_rows, vote_rows = _indexed(tables['protocols']), _indexed(tables['votes'])
    section_rows = _indexed(tables['sections'])
    if set(section_rows) != set(protocol_rows) or set(section_rows) != set(vote_rows):
        raise ValueError(f'Section, protocol and vote coverage disagree: {date}')
    methods, method_source = _method_sources(root, date, cache_dirs or {}, archives or {})
    archive = _archive_config(archives or {}, date)
    retained = _retained_evidence(root, date)[1]
    archive_verification = verify_official_archive(root, date, archive['path'], archive.get('sourceUrl')) if archive else (retained or {}).get('verification')
    if archive_verification and archive_verification['status'] != 'verified':
        raise ValueError(f'Canonical data do not match the explicitly selected official archive: {date}; '
                         f'{json.dumps(archive_verification["tables"], ensure_ascii=False)}')
    base = SOURCE_BASES[date]
    if archive_verification:
        base = archive_verification['sourceUrl'].split('/opendata/', 1)[0] + '/'
    records = {}
    for section_id, (section_line, section_values) in section_rows.items():
        geography = _section(section_values, tables['sections']['header'], settlements, municipalities)
        protocol_line, protocol_values = protocol_rows[section_id]
        protocol = dict(zip(tables['protocols']['header'], protocol_values))
        vote_line, vote_values = vote_rows[section_id]
        registered, added, voted = (_integer(protocol[key]) for key in ['totalA', 'totalB', 'voted'])
        no_support = _integer(protocol['noVotesPaper']) + _integer(protocol['noVotesMachine'])
        votes, candidate_total, flags = _votes(vote_values, tables['votes']['header'], parties,
                                               regional_parties, geography['regionId'], voted, no_support, date)
        evidence = methods.get(section_id)
        if evidence is None and protocol.get('col0'):
            form = _integer(protocol['col0'])
            evidence = {'form': form, 'method': _method(form, date),
                        'sourceUrl': base + 'opendata/export.zip',
                        'evidenceType': 'canonical_official_protocol_form',
                        'canonicalRef': _reference(tables['protocols'], protocol_line)}
        method = evidence['method'] if evidence else 'unknown'
        if geography['special']:
            method = 'special'
        if not registered:
            flags.append('zero_registered')
        if voted > registered + added:
            flags.append('voters_exceed_registered_plus_added')
        if candidate_total + no_support > voted:
            flags.append('valid_votes_exceed_voters')
        invalid = _integer(protocol['discardedVotes'])
        if candidate_total + no_support + invalid != voted:
            flags.append('ballots_do_not_equal_signed_voters')
        if method == 'unknown':
            flags.append('unknown_voting_method')
        protocol_url = (evidence or {}).get('protocolUrl', base + 'search/index.html#' + section_id)
        records[section_id] = {
            **geography, 'date': date, 'registered': registered, 'added': added,
            'settlementEkatteSource': 'derived_first_round_or_administrative_catalog' if date == SECOND_ROUND else
                                     'official_archive' if archive_verification else 'canonical_section_table',
            'electorateWithAdded': registered + added, 'voted': voted,
            'turnout': percentage(voted, registered),
            'turnoutWithAdded': percentage(voted, registered + added), 'sizeGroup': size_group(registered),
            'votingMethod': method, 'methodEvidence': evidence,
            'votesByParty': votes, 'totalCandidateVotes': candidate_total,
            'noSupport': no_support, 'invalidVotes': invalid,
            'protocolPaperVotes': _integer(protocol['protocolPaperVotes']),
            'protocolMachineVotes': _integer(protocol['protocolMachineVotes']), 'qualityFlags': flags,
            'sourceDiscrepancies': [],
            'sourceUrls': {'protocol': protocol_url, 'result': base + f'rezultati/{int(geography["regionId"]):02d}.html',
                           'search': base + 'search/index.html#' + section_id,
                           'canonical': tables['protocols']['url'], 'archive': base + 'opendata/export.zip'},
            'sourceRefs': {'sections': _reference(tables['sections'], section_line),
                           'protocols': _reference(tables['protocols'], protocol_line),
                           'votes': _reference(tables['votes'], vote_line)},
            'raw': {'section': section_values, 'protocol': protocol_values, 'votes': vote_values},
        }
    metadata_file = root / 'public/data' / date / 'source-results.json'
    snapshot = json.loads(metadata_file.read_text()) if metadata_file.exists() else None
    for discrepancy in (snapshot or {}).get('protocolDiscrepancies', []):
        affected = records.get(discrepancy.get('sectionId'))
        if affected:
            affected['sourceDiscrepancies'].append({
                **discrepancy,
                'sectionProtocolValue': affected.get(discrepancy.get('field')),
                'sourceUrl': base + f'protokoli/256/{int(discrepancy["regionId"]):02d}/ik.html',
                'localEvidenceUrl': '/data/' + date + '/source-results.json',
                'explanation': 'Сборът на секционните машинни разписки се различава от публикувания '
                               'РИК сбор. Секционният брой е запазен; това не променя гласувалите '
                               'или кандидатските гласове в анализа.',
            })
    return {'records': records, 'parties': parties,
            'regionalParties': {region + ':' + ballot: name for (region, ballot), name in regional_parties.items()},
            'metadata': {'date': date, 'sourceUrl': base + ('rezultati/index.html' if snapshot else 'opendata/export.zip'),
                         'provisional': date == SECOND_ROUND, 'recordCount': len(records),
                         'snapshot': snapshot, 'methodSource': method_source,
                         'canonicalArchiveVerification': archive_verification['status'] if archive_verification else
                                                         'not_recorded' if date in {'2024.10.27', '2026.04.19'} else 'existing_source_documentation',
                         'archiveVerification': archive_verification,
                         'archiveVersionLabel': archive.get('label') if archive else (retained or {}).get('label')},
            'tables': {name: {key: value for key, value in table.items() if key not in {'rows'}}
                       for name, table in tables.items()}}


def match_records(left, right):
    """Require a stable observed identity; do not invent cross-ID correspondences."""
    empty = {'status': 'unmatched', 'comparable': False, 'reasons': ['missing_election_record'],
             'identityChecks': {}, 'possibleSplitMerge': False}
    if not left or not right:
        return empty
    checks = {
        'sectionId': left['sectionId'] == right['sectionId'],
        'region': left['regionId'] == right['regionId'],
        'municipality': left['municipalityCode'] == right['municipalityCode'],
        'ekatte': bool(left['settlementEkatte'] and right['settlementEkatte']) and left['settlementEkatte'] == right['settlementEkatte'],
        'settlement': bool(left['settlementName'] and right['settlementName']) and normalize_identity(left['settlementName']) == normalize_identity(right['settlementName']),
        'address': bool(left['address'] and right['address']) and normalize_identity(left['address']) == normalize_identity(right['address']),
    }
    official_names = all(record.get('municipalityNameSource') == 'election_record' for record in [left, right])
    names_equal = normalize_identity(left.get('municipalityName')) == normalize_identity(right.get('municipalityName'))
    if official_names and not names_equal:
        checks['municipality'] = False
    notes = []
    if not official_names:
        notes.append('municipality_name_not_available_in_both_official_election_tables')
    if not names_equal:
        notes.append('municipality_display_labels_differ')
    if any(record.get('date') == SECOND_ROUND for record in [left, right]):
        notes.append('runoff_ekatte_derived_not_independent_confirmation')
    reasons = [key + '_changed_or_missing' for key, equal in checks.items() if not equal]
    if left['special'] or right['special'] or left.get('institutionReviewFlag') or right.get('institutionReviewFlag'):
        reasons.append('special_or_institution_section')
        status = 'special'
    else:
        status = 'matched' if all(checks.values()) else 'changed'
    return {'status': status, 'comparable': status == 'matched', 'reasons': reasons,
            'identityChecks': checks, 'identityNotes': notes, 'possibleSplitMerge': False}


def _address_key(record):
    return record['regionId'], record['settlementEkatte'], normalize_identity(record['address'])


def _mark_possible_splits(matches, reference, other):
    reference_addresses, other_addresses = defaultdict(set), defaultdict(set)
    for section_id, record in reference.items():
        reference_addresses[_address_key(record)].add(section_id)
    for section_id, record in other.items():
        other_addresses[_address_key(record)].add(section_id)
    for section_id, match in matches.items():
        if match['comparable'] or match['status'] == 'special':
            continue
        records = [records[section_id] for records in [reference, other] if section_id in records]
        candidates = set()
        for record in records:
            candidates |= reference_addresses.get(_address_key(record), set()) | other_addresses.get(_address_key(record), set())
        candidates.discard(section_id)
        if candidates:
            match.update(possibleSplitMerge=True, candidateSectionIds=sorted(candidates))
            match['reasons'].append('possible_address_reorganization_requires_protocol_review')


def load_dataset(root=None, dates=ANALYSIS_DATES, cache_dirs=None, archives=None):
    """Return elections and a section panel anchored to the official first round.

    cache_dirs maps election dates to existing official page caches. archives maps
    dates to retained original CIK ZIPs, used for original protocol form evidence.
    No network operation occurs implicitly. Missing evidence remains unknown.
    """
    root = Path(root) if root is not None else Path(__file__).resolve().parent.parent
    defaults = {FIRST_ROUND: Path('/tmp/cik-pvr202610-cache'),
                SECOND_ROUND: Path('/tmp/cik-pvr202610-tur2-cache')}
    defaults.update(cache_dirs or {})
    settlements, municipalities = _geography_catalog(root)
    elections = {date: load_election(root, date, settlements, municipalities, defaults, archives) for date in dates}
    if FIRST_ROUND not in elections or SECOND_ROUND not in elections:
        raise ValueError('The forensic panel requires both presidential rounds')
    reference = elections[FIRST_ROUND]['records']
    runoff = elections[SECOND_ROUND]['records']
    for section_id, current in runoff.items():
        earlier = reference.get(section_id)
        same_source_place = earlier and ' '.join(earlier['settlementName'].split()).casefold() == \
                                       ' '.join(current['settlementName'].split()).casefold()
        if same_source_place and earlier['settlementEkatte'] and earlier['settlementEkatte'] == current['settlementEkatte']:
            current['settlementEkatteSource'] = 'carried_first_round_section_id_and_settlement'
        else:
            current['settlementEkatteSource'] = 'resolved_administrative_catalog' if current['settlementEkatte'] else 'unavailable'
    # Runoff pages omit flags. Carry an explicit first-round special flag only
    # across an otherwise identical identity, and disclose its origin.
    for section_id in set(reference) & set(runoff):
        earlier, current = reference[section_id], runoff[section_id]
        checks = match_records(earlier, current)['identityChecks']
        if earlier['special'] and all(checks.values()):
            current['special'] = True
            current['specialReasons'] = ['unchanged_first_round_official_special_flag']
            current['specialEvidence'] = earlier['sourceRefs']['sections']
            current['votingMethod'] = 'special'
    section_ids = sorted(set(reference) | set(runoff))
    matches = {}
    for date, election in elections.items():
        matches[date] = {sid: match_records(reference.get(sid), election['records'].get(sid)) for sid in section_ids}
        _mark_possible_splits(matches[date], reference, election['records'])
    rows = []
    geography_keys = ['sectionId', 'regionId', 'regionName', 'municipalityCode', 'municipalityName',
                      'settlementEkatte', 'settlementName', 'address', 'rural', 'special', 'coordinates']
    for section_id in section_ids:
        current = runoff.get(section_id) or reference[section_id]
        round_match = matches[SECOND_ROUND][section_id]
        rows.append({**{key: current[key] for key in geography_keys},
                     'elections': {date: election['records'].get(section_id) for date, election in elections.items()},
                     'matches': {date: value[section_id] for date, value in matches.items()},
                     'roundMatch': round_match, 'comparableRoundPair': round_match['comparable'],
                     'exclusionReasons': round_match['reasons'][:]})
    quality = {
        'roundMatches': dict(Counter(row['roundMatch']['status'] for row in rows)),
        'methodCounts': {date: dict(Counter(record['votingMethod'] for record in election['records'].values()))
                         for date, election in elections.items()},
        'flags': {date: dict(Counter(flag for record in election['records'].values() for flag in record['qualityFlags']))
                  for date, election in elections.items()},
        'priorityMunicipalities': {region: sorted({row['municipalityName'] for row in rows if row['regionId'] == region})
                                  for region in PRIORITY_REGIONS},
        'historicalMatches': {date: dict(Counter(row['matches'][date]['status'] for row in rows)) for date in dates},
    }
    return {'elections': elections, 'rows': rows, 'quality': quality, 'definitions': DEFINITIONS,
            'provenance': {date: {'metadata': election['metadata'], 'tables': election['tables']}
                           for date, election in elections.items()}}
