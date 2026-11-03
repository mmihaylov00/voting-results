"""Descriptive historical presidential-runoff benchmarks from retained CIK data.

Sections are matched only within each election cycle. Historical addresses are
often absent, so these benchmarks do not establish repeated physical polling
places across years and are not a statistical normality test for 2026.
"""

from collections import Counter, defaultdict
import hashlib
from pathlib import Path
import re
import statistics
from urllib.parse import urlsplit

from electoral_forensics_data import (
    _geography_catalog, load_election, match_records, normalize_identity, percentage,
)


HISTORICAL_ROUNDS = (
    (2016, '2016.11.06', '2016.11.13'),
    (2021, '2021.11.14', '2021.11.21'),
)
FIRST_ROUND_CONTEXT = {
    2016: ('Първият тур съвпада с национален референдум.',
           'https://www.cik.bg/bg/decisions/3981/2016-11-06'),
    2021: ('Първият тур съвпада с парламентарни избори.',
           'https://www.cik.bg/bg/decisions/954/2021-11-14'),
}

DEFINITIONS = {
    'purpose': 'Описателен исторически ориентир, а не тест дали изборите през 2026 г. са нормални.',
    'matching': 'Съпоставяне само между двата тура на една година. При липсващи и в двата тура '
                'адреси се изискват еднакви секционен номер, район, общински код, ЕКАТТЕ и населено място.',
    'small400': 'Фиксирана извадка: положителен totalA до 400 включително на първия тур.',
    'turnout': '100 × подписали се / totalA на съответния тур; totalB се пази отделно.',
    'candidateShares': 'Дял от действителните кандидатски гласове с включен вот „Не подкрепям никого“.',
    'finalists': 'Президентските двойки се свързват по нормализирано пълно име, а не по номер на бюлетината.',
    'stableList': 'Допълнителна извадка с абсолютна промяна на totalA не повече от 5% спрямо първия тур.',
}


def match_finalists(first_parties, second_parties):
    """Resolve the two runoff tickets by identity, including changed ballot IDs."""
    if len(second_parties) != 2:
        raise ValueError('A presidential runoff must contain exactly two registered candidate tickets')
    identities = defaultdict(list)
    for ballot, name in first_parties.items():
        identity = normalize_identity(name)
        if not identity:
            raise ValueError('Missing first-round candidate identity')
        identities[identity].append((str(ballot), name))
    result, seen = [], set()
    for ballot, name in sorted(second_parties.items(), key=lambda item: int(item[0])):
        identity = normalize_identity(name)
        candidates = identities.get(identity, [])
        if not identity or identity in seen or len(candidates) != 1:
            raise ValueError(f'Missing or ambiguous historical finalist identity: {name!r}')
        seen.add(identity)
        first_ballot, first_name = candidates[0]
        result.append({'name': name, 'name1': first_name, 'ballot1': first_ballot, 'ballot2': str(ballot)})
    return result


def _pair_status(first, second):
    if first is None or second is None:
        return False, ['missing_round1' if first is None else 'missing_round2'], None
    match = match_records(first, second)
    if first['special'] or second['special']:
        return False, ['official_special_section'], None
    if first.get('institutionReviewFlag') or second.get('institutionReviewFlag'):
        return False, ['institution_address_review'], None
    if match['comparable']:
        return True, [], 'address_checked'
    checks = match['identityChecks']
    missing_both_addresses = not first.get('address') and not second.get('address')
    if missing_both_addresses and all(value for key, value in checks.items() if key != 'address'):
        return True, [], 'code_place_only_missing_addresses'
    return False, match['reasons'], None


def _arithmetic_reasons(record, round_number):
    reasons = [f'round{round_number}:' + flag for flag in record.get('qualityFlags', [])
               if flag != 'unknown_voting_method']
    if record['registered'] <= 0:
        reasons.append(f'round{round_number}:nonpositive_initial_list')
    if record['voted'] > record['registered'] + record['added']:
        reasons.append(f'round{round_number}:signed_exceeds_initial_plus_added')
    valid = record['totalCandidateVotes'] + record['noSupport']
    if valid > record['voted']:
        reasons.append(f'round{round_number}:valid_votes_exceed_voters')
    if valid + record['invalidVotes'] != record['voted']:
        reasons.append(f'round{round_number}:ballots_do_not_equal_signed_voters')
    return list(dict.fromkeys(reasons))


def _aggregate(pairs, finalists):
    result = {'n': len(pairs)}
    for suffix, position in [('1', 0), ('2', 1)]:
        for key in ['registered', 'added', 'voted']:
            result[key + suffix] = sum(pair[position][key] for pair in pairs)
        result['turnout' + suffix] = percentage(result['voted' + suffix], result['registered' + suffix])
    result['deltaVoted'] = result['voted2'] - result['voted1']
    result['deltaTurnoutPp'] = result['turnout2'] - result['turnout1'] if pairs else None
    result['meanDeltaPp'] = statistics.mean(100 * second['voted'] / second['registered'] -
                                          100 * first['voted'] / first['registered']
                                          for first, second, _ in pairs) if pairs else None
    result['finalists'] = []
    denominators = [sum(pair[position]['totalCandidateVotes'] + pair[position]['noSupport'] for pair in pairs)
                    for position in [0, 1]]
    for finalist in finalists:
        votes = [sum(pair[position]['votesByParty'][finalist['ballot' + str(position + 1)]]['total']
                     for pair in pairs) for position in [0, 1]]
        shares = [percentage(votes[position], denominators[position]) for position in [0, 1]]
        result['finalists'].append({**finalist, 'votes1': votes[0], 'votes2': votes[1],
                                    'deltaVotes': votes[1] - votes[0], 'share1': shares[0], 'share2': shares[1],
                                    'deltaSharePp': shares[1] - shares[0] if None not in shares else None})
    return result


def build_runoff_benchmark(first_election, second_election, *, cycle, round1_date, round2_date,
                           small400=False, sources=None):
    """Summarize one within-cycle cohort without inferring individual transfers."""
    if round1_date >= round2_date:
        raise ValueError('Runoff dates must be ordered first round then second round')
    finalists = match_finalists(first_election['parties'], second_election['parties'])
    first_records, second_records = first_election['records'], second_election['records']
    pairs, exclusions, matching = [], Counter(), Counter()
    sections, abroad = 0, 0
    for section_id in sorted(set(first_records) | set(second_records)):
        first, second = first_records.get(section_id), second_records.get(section_id)
        present = second or first
        if not present['regionId'].isdigit() or not 1 <= int(present['regionId']) <= 31:
            abroad += 1
            continue
        if small400 and (first is None or not 0 < first['registered'] <= 400):
            continue
        sections += 1
        comparable, reasons, confidence = _pair_status(first, second)
        if comparable:
            reasons += _arithmetic_reasons(first, 1) + _arithmetic_reasons(second, 2)
            for position, record in enumerate([first, second], 1):
                if any(finalist['ballot' + str(position)] not in record['votesByParty'] for finalist in finalists):
                    reasons.append(f'round{position}:missing_finalist_vote_record')
        if not comparable or reasons:
            exclusions.update(reasons)
            continue
        pairs.append((first, second, confidence))
        matching[confidence] += 1
    stable = [pair for pair in pairs if abs(pair[1]['registered'] - pair[0]['registered']) / pair[0]['registered'] <= .05]
    regions = defaultdict(list)
    for pair in pairs:
        regions[pair[0]['regionId']].append(pair)
    flags_known = {}
    for date, election in [(round1_date, first_election), (round2_date, second_election)]:
        header = election.get('tables', {}).get('sections', {}).get('header', [])
        flags_known[date] = all(field in header for field in ['isMobile', 'isShip'])
    limitations = [
        'Извадките за различните години не означават едни и същи физически секции или едни и същи избиратели.',
        'Кандидатските състави и изборният контекст се различават; сравнението не е тест за нарушение или нормалност.',
        'Агрегираните кандидатски разлики не установяват индивидуално прехвърляне на гласове.',
    ]
    if matching['code_place_only_missing_addresses']:
        limitations.insert(0, 'В историческите таблици липсват адреси. Съпоставянето е по код и населено място; '
                              'физическият адрес и институционалният характер не могат да се проверят независимо.')
    if not all(flags_known.values()):
        limitations.append('Част от старите секционни флагове нямат документирани имена в каноничната таблица. '
                           'Не е гарантирано пълно изключване на подвижни, корабни и други специални секции; '
                           'неименуваните полета не се тълкуват по предположение.')
    confidence = 'mixed' if len(matching) > 1 else next(iter(matching), 'no_eligible_pairs')
    return {
        'cycle': cycle, 'round1Date': round1_date, 'round2Date': round2_date,
        'context': FIRST_ROUND_CONTEXT.get(cycle, ('', None))[0],
        'contextSourceUrl': FIRST_ROUND_CONTEXT.get(cycle, ('', None))[1],
        'sections': sections, 'excludedN': sections - len(pairs), **_aggregate(pairs, finalists),
        'cohortDefinition': 'Съпоставени секции в страната; наличните специални флагове и адресни маркери '
                            'се изключват; положителен първоначален списък и без аритметични противоречия. '
                            + ('Фиксирано ограничение totalA на I тур до 400 включително.' if small400 else 'Всички размери.'),
        'matchingConfidence': confidence,
        'stableListSensitivity': {'maxAbsoluteRegisteredChangePct': 5, **_aggregate(stable, finalists)},
        'regions': [{'regionId': region, 'regionName': members[0][0]['regionName'], **_aggregate(members, finalists)}
                    for region, members in sorted(regions.items(), key=lambda item: int(item[0]))],
        'quality': {'exclusionReasons': dict(exclusions), 'matching': dict(matching), 'abroadExcludedN': abroad,
                    'namedSpecialFlagCoverage': flags_known, 'descriptiveOnly': True},
        'sources': sources or [], 'limitations': limitations,
    }


def _documented_source(root, date, election):
    path = root / 'public/data' / date / 'SOURCE.md'
    content = path.read_bytes() if path.exists() else b''
    text = content.decode('utf-8')
    source = re.search(r'(?:Official source|Source):\s*(https://\S+)', text)
    archive_hash = re.search(r'Archive SHA-256:\s*`([a-f0-9]{64})`', text)
    url = source[1].rstrip('.') if source else None
    host = urlsplit(url).hostname if url else None
    documented = bool(url and host and (host == 'cik.bg' or host.endswith('.cik.bg'))
                      and archive_hash and 'Rebuilt with' in text)
    return {'date': date, 'sourceUrl': url, 'archiveSha256': archive_hash[1] if archive_hash else None,
            'trustStatus': 'documented_official_archive_rebuild' if documented else 'verification_pending',
            'freshArchiveVerification': False,
            'sourceDocumentationUrl': '/data/' + date + '/SOURCE.md' if content else None,
            'sourceDocumentationSha256': hashlib.sha256(content).hexdigest() if content else None,
            'canonicalHashes': {name: table['sha256'] for name, table in election.get('tables', {}).items()}}


def build_historical_benchmarks(root):
    """Load 2016 and 2021 once per cycle and return both report cohorts."""
    root = Path(root)
    settlements, municipalities = _geography_catalog(root)
    result = {'query1': [], 'query2': [], 'metadata': {'definitions': DEFINITIONS, 'cycles': [], 'sources': []}}
    for cycle, round1_date, round2_date in HISTORICAL_ROUNDS:
        elections = [load_election(root, date, settlements, municipalities) for date in [round1_date, round2_date]]
        sources = [_documented_source(root, date, election)
                   for date, election in zip([round1_date, round2_date], elections)]
        for query, small400 in [('query1', False), ('query2', True)]:
            result[query].append(build_runoff_benchmark(*elections, cycle=cycle, round1_date=round1_date,
                                                       round2_date=round2_date, small400=small400, sources=sources))
        result['metadata']['cycles'].append(cycle)
        result['metadata']['sources'].extend(sources)
    return result
