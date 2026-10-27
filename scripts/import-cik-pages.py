"""Import the provisional 25 October 2026 presidential snapshot from published CIK pages.

Run with: uv run --no-project --with curl-cffi python scripts/import-cik-pages.py
"""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import gzip
import hashlib
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo


BASE = 'https://results.cik.bg/pvr202610/'
DATE = '2026.10.25'
SOURCE = BASE + 'rezultati/index.html'
PROTOCOL_FIELDS = ['totalA', 'totalB', 'voted', 'discardedVotes', 'noVotesPaper',
                   'noVotesMachine', 'protocolPaperVotes', 'protocolMachineVotes']
OBLASTS = dict(zip(map(str, range(1, 32)),
    'BLG BGS VAR VTR VID VRC GAB DOB KRZ KNL LOV MON PAZ PER PVN PDV-00 PDV RAZ RSE SLS SLV SML S23 S24 S25 SFO SZR TGV HKV SHU JAM'.split()))


def clean(value):
    return ' '.join(value.split())


def integer(value):
    value = ''.join(value.split())
    if not re.fullmatch(r'\d+', value):
        raise ValueError(f'Missing or invalid integer: {value!r}')
    return int(value)


class Page(HTMLParser):
    """Read tables, source links and the public section directory without executing scripts."""

    def __init__(self, html, read_sections=False):
        super().__init__(convert_charrefs=True)
        self.tables, self.links, self.scripts, self.text, self.sections = [], [], [], [], {}
        self.table = self.row = self.cell = self.link = self.span = None
        self.group = self.address = None
        self.divs = []
        self.ignored = 0
        self.read_sections = read_sections
        version = re.search(r'VERSION\s*=\s*[\'"]\?v=([a-f0-9]+)[\'"]', html)
        self.version = version[1] if version else None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'script', 'style'}:
            self.ignored += 1
            if tag == 'script' and attrs.get('src'):
                self.scripts.append(attrs['src'])
        if tag == 'table':
            if self.table is not None:
                raise ValueError('Unexpected nested result table')
            self.table = []
        elif tag == 'tr':
            self.row = []
        elif tag in {'td', 'th'}:
            self.cell = []
        elif tag == 'br' and self.cell is not None:
            self.cell.append('\n')
        elif tag == 'a':
            self.link = [attrs.get('href', ''), []]
        elif tag == 'div':
            self.divs.append((self.group, self.address))
            if 'pr-group' in attrs.get('class', '').split():
                self.group = (attrs.get('data-ik'), attrs.get('data-city'))
            if 'addr-group' in attrs.get('class', '').split():
                self.address = attrs.get('data-addr')
        elif tag == 'span' and self.read_sections and self.group and '256' in attrs.get('data-el', '').split(','):
            self.span = []

    def handle_data(self, text):
        if self.ignored:
            return
        self.text.append(text)
        if self.cell is not None:
            self.cell.append(text)
        if self.link is not None:
            self.link[1].append(text)
        if self.span is not None:
            self.span.append(text)

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.ignored -= 1
        elif tag in {'td', 'th'} and self.cell is not None:
            self.row.append(''.join(self.cell).strip())
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.table is not None:
                self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None
        elif tag == 'a' and self.link is not None:
            self.links.append((self.link[0], clean(''.join(self.link[1]))))
            self.link = None
        elif tag == 'span' and self.span is not None:
            section_id = clean(''.join(self.span))
            if not re.fullmatch(r'\d+', section_id):
                self.span = None
                return
            if not re.fullmatch(r'\d{9}', section_id) or section_id in self.sections:
                raise ValueError(f'Invalid or duplicate section: {section_id}')
            region, place = self.group
            if not region or not place or self.address is None or not section_id.startswith(region):
                raise ValueError(f'Incomplete section metadata: {section_id}')
            municipality, city = ('', place) if region == '32' else place.split('/', 1)
            self.sections[section_id] = {'regionId': str(int(region)), 'cityName': city,
                'municipalityName': municipality, 'sectionName': self.address}
            self.span = None
        elif tag == 'div' and self.divs:
            self.group, self.address = self.divs.pop()

    def candidate_tables(self):
        tables = []
        for table in self.tables:
            if not table or not any('кандидатск' in clean(c).lower() for c in table[0]):
                continue
            votes, names = {}, {}
            for row in table[1:]:
                if len(row) < 3 or not re.fullmatch(r'\d+', clean(row[0])):
                    continue
                party_id = str(integer(row[0]))
                if party_id in votes:
                    raise ValueError(f'Duplicate candidate: {party_id}')
                votes[party_id] = integer(row[2])
                names[party_id] = clean(row[1].split('\n', 1)[0])
            if votes:
                tables.append((votes, names))
        return tables

    def metrics(self, predicate):
        return [integer(row[1]) for table in self.tables for row in table
                if len(row) == 2 and predicate(clean(row[0]).lower())]

    def metric(self, predicate):
        values = self.metrics(predicate)
        if not values:
            raise ValueError('Required protocol metric is missing')
        return values[0]


def snapshot(page):
    match = re.search(r'Данни към (\d{2}:\d{2}) на (\d{2}\.\d{2}\.\d{4}) при обработени ([\d.]+)%',
                      clean(' '.join(page.text)))
    if not match:
        raise ValueError('Missing provisional snapshot timestamp or processing percentage')
    stamp = datetime.strptime(f'{match[2]} {match[1]}', '%d.%m.%Y %H:%M')
    tables = page.candidate_tables()
    if len(tables) != 1:
        raise ValueError('Expected one candidate result table')
    no_votes = [integer(row[2]) for table in page.tables for row in table
                if len(row) >= 3 and 'не подкрепям никого' in clean(row[1]).lower()]
    if len(no_votes) != 1:
        raise ValueError('Missing or duplicate no-support result')
    percentages = {str(integer(row[0])): clean(row[3]) for table in page.tables
                   for row in table if len(row) == 4 and re.fullmatch(r'\d+', clean(row[0]))}
    no_votes_percent = next(clean(row[3]) for table in page.tables for row in table
                           if len(row) == 4 and 'не подкрепям никого' in clean(row[1]).lower())
    return {'updatedAt': stamp.replace(tzinfo=ZoneInfo('Europe/Sofia')).isoformat(),
            'processedPercent': float(match[3]), 'votes': tables[0][0],
            'names': tables[0][1], 'noVotes': no_votes[0],
            'percentages': percentages, 'noVotesPercent': no_votes_percent,
            'sourceVersion': page.version}


def assignment(text, name):
    match = re.search(rf'\b{re.escape(name)}\s*=\s*', text)
    if not match:
        raise ValueError(f'Missing public inventory: {name}')
    return json.JSONDecoder().raw_decode(text[match.end():])[0]


def protocol_plan(inventory):
    plans = {}
    for region, sections in inventory['256'].items():
        if not re.fullmatch(r'\d{2}', region) or not 1 <= int(region) <= 32:
            raise ValueError(f'Invalid source region: {region}')
        for suffix, forms in sections.items():
            if suffix.startswith('ik'):
                continue
            if not re.fullmatch(r'\d{1,7}', suffix):
                raise ValueError(f'Invalid source section suffix: {suffix}')
            section_id = region + suffix.zfill(7)
            if section_id in plans:
                raise ValueError(f'Duplicate normalized section ID: {section_id}')
            index = '0' if '0' in forms else '1'
            form = forms.get(index)
            if form not in {24, 28, 33, 37, 43, 45}:
                raise ValueError(f'Unsupported summary form {form} for {section_id}')
            main = f'protokoli/256/{region}/{section_id}.{index}.html'
            component = f'protokoli/256/{region}/{section_id}.1.html' if form in {33, 43} else None
            plans[section_id] = (main, component, form)
    return plans


class Fetcher:
    def __init__(self, cache):
        from curl_cffi import requests
        self.requests, self.cache, self.local = requests, cache, threading.local()

    def get(self, relative, fresh=False):
        source_path = Path(urlsplit(relative).path)
        if urlsplit(relative).scheme or urlsplit(relative).netloc or source_path.is_absolute() or '..' in source_path.parts:
            raise ValueError('Only CIK-relative source paths are allowed')
        target = self.cache / source_path
        if not target.resolve().is_relative_to(self.cache.resolve()):
            raise ValueError('Source cache path escapes the cache directory')
        if target.exists() and not fresh:
            return target.read_text(encoding='utf-8-sig')
        if not hasattr(self.local, 'session'):
            self.local.session = self.requests.Session(impersonate='chrome')
        for attempt in range(4):
            try:
                response = self.local.session.get(BASE + relative, timeout=30)
                response.raise_for_status()
                text = response.content.decode('utf-8-sig')
                if relative.split('?', 1)[0].endswith('.html') and '<table' not in text.lower() and 'listing' not in text:
                    raise ValueError(f'Expected published CIK HTML: {relative}')
                # Fresh consistency checks must not change the pinned snapshot cache.
                if not fresh:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    temporary = target.with_suffix(target.suffix + '.tmp')
                    temporary.write_text(text, encoding='utf-8')
                    temporary.replace(target)
                time.sleep(0.1)
                return text
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)


def no_support(label):
    return 'не подкрепям никого' in label


def paper_ballots(label):
    return ('брой на бюлетините, намерени' in label or
            'брой на намерените в избирателните кутии бюлетини' in label) and 'и потвърдените' not in label


def invalid_ballots(label):
    return 'недействителн' in label and 'намерен' in label and 'гласов' in label and 'чл.' not in label


def parse_protocol(section_id, html, form, component_html=None):
    page = Page(html)
    if not re.search(rf'№\s*{section_id}\b', clean(' '.join(page.text))):
        raise ValueError(f'Protocol section does not match URL: {section_id}')
    distributions = page.candidate_tables()
    if len(distributions) != 1:
        raise ValueError(f'Missing or duplicate summary candidate table: {section_id}')
    votes = distributions[0][0]
    result = {
        'totalA': page.metric(lambda s: 'брой на избирателите' in s and 'при предаването' in s),
        'totalB': page.metric(lambda s: 'вписани в допълнителн' in s),
        'voted': page.metric(lambda s: 'според положените подписи' in s),
        'names': distributions[0][1], 'votes': votes,
    }
    if form in {24, 28}:
        result.update(paper=votes.copy(), machine={key: 0 for key in votes},
            discardedVotes=page.metric(invalid_ballots), noVotesPaper=page.metric(no_support),
            noVotesMachine=0, protocolPaperVotes=page.metric(paper_ballots), protocolMachineVotes=0)
    elif form in {37, 45}:
        result.update(paper={key: 0 for key in votes}, machine=votes.copy(),
            discardedVotes=0, noVotesPaper=0, noVotesMachine=page.metric(no_support),
            protocolPaperVotes=0,
            protocolMachineVotes=page.metric(lambda s: 'брой на потвърдените гласове от машинното гласуване' in s))
    else:
        component = Page(component_html)
        if not re.search(rf'№\s*{section_id}\b', clean(' '.join(component.text))):
            raise ValueError(f'Constituent protocol section does not match URL: {section_id}')
        parts = component.candidate_tables()
        if len(parts) < 2 or any(names != distributions[0][1] for _, names in parts):
            raise ValueError(f'Missing constituent paper/machine counts: {section_id}')
        machine = Counter()
        for part, _ in parts[1:]:
            machine.update(part)
        none = component.metrics(no_support)
        if len(none) != len(parts):
            raise ValueError(f'Missing constituent no-support counts: {section_id}')
        result.update(paper=parts[0][0], machine=dict(machine),
            discardedVotes=page.metric(invalid_ballots) + sum(page.metrics(lambda s: 'по технически причини не може да се установи' in s)),
            noVotesPaper=none[0], noVotesMachine=sum(none[1:]),
            protocolPaperVotes=component.metric(paper_ballots),
            protocolMachineVotes=sum(component.metrics(lambda s: 'брой на контролните разписки от машинното гласуване' in s)))
        if result['noVotesPaper'] + result['noVotesMachine'] != page.metric(no_support):
            raise ValueError(f'Constituent no-support counts disagree with summary: {section_id}')
    return result


def write_table(directory, name, headers, rows):
    with (directory / f'{name}.txt.gz').open('wb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding='utf-8', newline='\n') as text:
                text.write(';'.join(headers) + '\n')
                for row in rows:
                    text.write(';'.join(clean(str(value)).replace(';', ',') for value in row) + '\n')


def place_name(value):
    return clean(re.sub(r'^(?:гр|с|кв|жк)\.\s*', '', value, flags=re.IGNORECASE)).casefold()


def settlement_resolver(municipalities, settlements):
    municipalities_by_name = defaultdict(set)
    districts = {}
    settlements_by_name = defaultdict(set)
    for municipality in municipalities:
        municipalities_by_name[(municipality['oblast'], place_name(municipality['name']))].add(municipality['obshtina'])
        districts[municipality['obshtina']] = municipality
    for settlement in settlements:
        settlements_by_name[(settlement['obshtina'], place_name(settlement['name']))].add(
            (settlement['ekatte'], settlement.get('t_v_m', '')))

    def resolve(section_id, section):
        oblast = OBLASTS.get(section['regionId'])
        city, municipality = place_name(section['cityName']), place_name(section['municipalityName'])
        if not oblast:
            return ''
        if section['regionId'] in {'23', '24', '25'} and municipality == 'софия':
            district = districts.get(oblast + section_id[4:6])
            if not district:
                return ''
            if city == 'софия':
                return district['ekatte']
            codes = {district['obshtina']}
        else:
            codes = municipalities_by_name.get((oblast, municipality), set())
        candidates = set()
        if len(codes) == 1:
            source_type = re.match(r'^(гр|с|кв|жк)\.', section['cityName'], re.IGNORECASE)
            source_type = source_type[1].lower() + '.' if source_type else ''
            candidates = {ekatte for ekatte, kind in settlements_by_name.get((next(iter(codes)), city), set())
                          if not source_type or not kind or source_type == kind}
        return next(iter(candidates)) if len(candidates) == 1 else ''
    return resolve


def publish(root, directory, entry):
    catalog_path = root / 'src/assets/elections.json'
    catalog = json.loads(catalog_path.read_text())
    existing = next((item for item in catalog if item['date'] == DATE), None)
    destination = root / 'public/data' / DATE
    if existing and not existing.get('provisional'):
        raise ValueError('Refusing to overwrite a final election')
    if existing and (existing.get('type') != 'presidential' or existing.get('round') != 1):
        raise ValueError('Conflicting election type or presidential round')
    if destination.exists() and not existing:
        raise ValueError('Refusing to overwrite an unregistered dataset')
    catalog = [item for item in catalog if item['date'] != DATE] + [entry]
    catalog.sort(key=lambda item: item['date'], reverse=True)
    temporary_catalog = catalog_path.with_suffix('.json.cik-import')
    temporary_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    backup = destination.with_name(f'.{DATE}-previous-{os.getpid()}')
    moved = False
    try:
        if destination.exists():
            destination.rename(backup)
        directory.rename(destination)
        moved = True
        temporary_catalog.replace(catalog_path)
    except Exception:
        if moved:
            shutil.rmtree(destination)
        if backup.exists():
            backup.rename(destination)
        temporary_catalog.unlink(missing_ok=True)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def import_pages(root, cache):
    root, cache = root.resolve(), cache.resolve()
    if cache.is_relative_to(root):
        raise ValueError('The raw HTML cache must be outside the repository')
    catalog = json.loads((root / 'src/assets/elections.json').read_text())
    if any(item['date'] == DATE and not item.get('provisional') for item in catalog):
        raise ValueError('Refusing to overwrite a final election')
    fetcher = Fetcher(cache)
    initial_html = fetcher.get('rezultati/index.html', fresh=True)
    initial_page = Page(initial_html)
    initial = snapshot(initial_page)
    if '25 октомври 2026' not in clean(' '.join(initial_page.text)).lower() or set(initial['votes']) != {str(i) for i in range(1, 28)}:
        raise ValueError('Unexpected election date or presidential ballot options')
    fingerprint = hashlib.sha256(json.dumps(initial, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    marker = cache / 'snapshot-fingerprint.json'
    cached_national = cache / 'rezultati/index.html'
    pinned = json.loads(marker.read_text()) if marker.exists() else (
        snapshot(Page(cached_national.read_text())) if cached_national.exists() else initial)
    if pinned != initial:
        cache = cache / 'snapshots' / fingerprint
        fetcher = Fetcher(cache)
        marker = cache / 'snapshot-fingerprint.json'
        cached_national = cache / 'rezultati/index.html'
    cached_national.parent.mkdir(parents=True, exist_ok=True)
    cached_national.write_text(initial_html, encoding='utf-8')
    marker.write_text(json.dumps(initial, ensure_ascii=False, indent=2) + '\n')
    regions = {}
    for href, name in initial_page.links:
        match = re.fullmatch(r'.*/rezultati/(\d{2})\.html', urljoin(SOURCE, href))
        if match and 1 <= int(match[1]) <= 32:
            regions[str(int(match[1]))] = 'Чужбина' if match[1] == '32' else name
    if set(regions) != {str(i) for i in range(1, 33)}:
        raise ValueError('Missing regional result links')
    search = Page(fetcher.get('search/index.html'), read_sections=True)
    inventory_url = next(urljoin(BASE + 'search/index.html', src) for src in search.scripts
                         if urljoin(BASE + 'search/index.html', src).startswith(BASE + 'protokoli/data.js'))
    inventory_path = inventory_url.removeprefix(BASE)
    plans = protocol_plan(assignment(fetcher.get(inventory_path), 'HAS_PROTO'))
    if not plans or not set(plans) <= set(search.sections):
        raise ValueError('Protocol inventory does not match the public section directory')
    missing = sorted(set(search.sections) - set(plans))
    reported_percent = round(len(plans) / len(search.sections) * 100, 2)
    if abs(reported_percent - initial['processedPercent']) > 0.01:
        raise ValueError('Section coverage does not match the published processing percentage')
    regional = {region: snapshot(Page(fetcher.get(f'rezultati/{int(region):02d}.html')))
                for region in regions}
    if any(value['updatedAt'] != initial['updatedAt'] for value in regional.values()):
        raise ValueError('Regional pages belong to different source snapshots')

    def load(item):
        section_id, (main, component, form) = item
        result = parse_protocol(section_id, fetcher.get(main), form,
                                fetcher.get(component) if component else None)
        if result['names'] != initial['names']:
            raise ValueError(f'Candidate identity mismatch: {section_id}')
        return section_id, result

    results = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(load, item) for item in plans.items()]
        for count, future in enumerate(as_completed(futures), 1):
            section_id, result = future.result()
            results[section_id] = result
            if count % 500 == 0:
                print(f'Validated {count}/{len(plans)} reported sections', flush=True)
    aggregates = defaultdict(lambda: {'votes': Counter(), 'metrics': Counter()})
    for section_id, result in results.items():
        region = search.sections[section_id]['regionId']
        aggregates[region]['votes'].update(result['votes'])
        aggregates[region]['metrics'].update({field: result[field] for field in PROTOCOL_FIELDS})
    national_votes, national_no_votes = Counter(), 0
    regional_protocol_totals = {}
    for region, aggregate in aggregates.items():
        if dict(aggregate['votes']) != regional[region]['votes']:
            raise ValueError(f'Section candidate totals disagree with regional results: {region}')
        none = aggregate['metrics']['noVotesPaper'] + aggregate['metrics']['noVotesMachine']
        if none != regional[region]['noVotes']:
            raise ValueError(f'Section no-support totals disagree with regional results: {region}')
        protocol = Page(fetcher.get(f'protokoli/256/{int(region):02d}/ik.html'))
        unreadable = sum(protocol.metrics(lambda s: 'по технически причини не може да се установи' in s))
        confirmed_machine = protocol.metric(lambda s: 'брой на потвърдените гласове от машинното гласуване' in s)
        checks = {
            'totalA': protocol.metric(lambda s: 'брой на избирателите' in s and 'при предаването' in s),
            'totalB': protocol.metric(lambda s: 'вписани в допълнителн' in s),
            'voted': protocol.metric(lambda s: 'според положените подписи' in s),
            'discardedVotes': protocol.metric(invalid_ballots) + unreadable,
            'protocolPaperVotes': protocol.metric(paper_ballots),
            # Cast machine receipts include the separately reported unreadable receipts.
            'protocolMachineVotes': confirmed_machine + unreadable,
        }
        regional_protocol_totals[region] = {**checks, 'confirmedMachineVotes': confirmed_machine,
                                           'unreadableMachineReceipts': unreadable}
        for field, expected in checks.items():
            if aggregate['metrics'][field] != expected:
                raise ValueError(f'Section {field} disagrees with RIK protocol {region}: {aggregate["metrics"][field]} != {expected}')
        national_votes.update(aggregate['votes'])
        national_no_votes += none
    if dict(national_votes) != initial['votes'] or national_no_votes != initial['noVotes']:
        raise ValueError('Section totals disagree with the national result')
    if snapshot(Page(fetcher.get('rezultati/index.html', fresh=True))) != initial:
        raise ValueError('The source snapshot changed during extraction; nothing was published')
    metadata = {'sourceUrl': SOURCE, 'updatedAt': initial['updatedAt'],
                'processedPercent': initial['processedPercent'], 'reportedSections': len(results),
                'totalSections': len(search.sections)}
    entry = {'date': DATE, 'name': 'Октомври 2026 - Тур 1', 'type': 'presidential',
             'round': 1, 'provisional': metadata}
    directory = Path(tempfile.mkdtemp(prefix=f'.{DATE}-', dir=root / 'public/data'))
    try:
        section_ids = sorted(results)
        resolve_settlement = settlement_resolver(json.loads((root / 'public/municipalities.json').read_text()),
                                                json.loads((root / 'public/settlements.json').read_text()))
        ekatte = {section_id: resolve_settlement(section_id, search.sections[section_id]) for section_id in section_ids}
        unmapped = [section_id for section_id in section_ids
                    if search.sections[section_id]['regionId'] != '32' and not ekatte[section_id]]
        write_table(directory, 'sections',
            ['sectionId', 'regionId', 'regionName', 'municipalityId', 'cityName', 'sectionName', 'municipalityName'],
            ([section_id, search.sections[section_id]['regionId'], regions[search.sections[section_id]['regionId']], ekatte[section_id],
              search.sections[section_id]['cityName'], search.sections[section_id]['sectionName'],
              search.sections[section_id]['municipalityName']] for section_id in section_ids))
        write_table(directory, 'protocols', ['sectionId', *PROTOCOL_FIELDS],
            ([section_id, *(results[section_id][field] for field in PROTOCOL_FIELDS)] for section_id in section_ids))
        parties = sorted(initial['votes'], key=int)
        write_table(directory, 'votes', ['sectionId', 'regionId'] + ['partyId', 'total', 'paper', 'machine'] * len(parties),
            ([section_id, search.sections[section_id]['regionId'],
              *(value for party in parties for value in [party, results[section_id]['votes'][party],
                 results[section_id]['paper'][party], results[section_id]['machine'][party]])] for section_id in section_ids))
        write_table(directory, 'cik_parties', ['partyId', 'partyName'],
                    ([party, initial['names'][party]] for party in parties))
        digest = hashlib.sha256(json.dumps(initial, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        (directory / 'source-results.json').write_text(json.dumps(
            {'sourceUrl': SOURCE, 'national': initial, 'regions': regional,
             'regionalProtocolTotals': regional_protocol_totals,
             'unprocessedSections': missing, 'unmappedDomesticSections': unmapped},
            ensure_ascii=False, indent=2) + '\n')
        (directory / 'SOURCE.md').write_text(
            f'# Provisional presidential results, 25 October 2026, round 1\n\nSource: {SOURCE}\n\n'
            f'Published snapshot: {metadata["updatedAt"]}; processed {metadata["processedPercent"]}%. '
            f'Imported {len(results)} reported sections from {len(search.sections)} listed sections.\n\n'
            f'Unprocessed sections, omitted rather than assigned zero results: {", ".join(missing)}.\n\n'
            'Source HTML was parsed without executing JavaScript. Each section uses its combined numerical '
            'summary when published, otherwise its paper protocol. Mixed paper/machine sections use the '
            'explicit constituent tables in the main protocol for ballot-type splits. Zero values for '
            'absent voting channels are not-applicable values established by the published protocol form. '
            'Machine protocol totals count all cast control receipts, including unreadable receipts, '
            'just as paper totals include invalid ballots. RIK confirmed-machine counts exclude unreadable '
            'receipts, so the regional cross-check adds that separately published count. Both measures '
            'are preserved in `source-results.json`. '
            'EKATTE identifiers use unique existing municipality and settlement identities. Sofia uses the '
            'existing district codes in section IDs and the district-center EKATTE for Sofia city. '
            f'Unmatched domestic sections without an EKATTE: {len(unmapped)}; their IDs are retained in '
            '`source-results.json`. Physical section coordinates remain unavailable. Original protocol inconsistencies '
            'are preserved. Presidential preferences are not applicable.\n\n'
            'Every candidate and no-support count was checked against all 32 regional results and the '
            'national result. Electors, added electors, voted, invalid votes and ballot-type totals were '
            'checked against all 32 numerical RIK protocols. The national snapshot was checked again '
            'before publishing. Official CIK percentages are retained in `source-results.json`; '
            'the site keeps its existing percentage denominator (signed-in voters), which can differ from '
            'CIK percentages based on valid votes including no-support votes. '
            f'National result SHA-256: `{digest}`.\n')
        publish(root, directory, entry)
    finally:
        if directory.exists():
            shutil.rmtree(directory)
    print(f'Published {DATE}: {len(results)}/{len(search.sections)} sections, {metadata["processedPercent"]}% processed', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'cik-pvr202610-cache')
    args = parser.parse_args()
    import_pages(Path(__file__).resolve().parent.parent, args.cache_dir)
