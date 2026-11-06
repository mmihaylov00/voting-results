"""Descriptive runoff comparison by the 2023 municipal mayor nomination.

Election nominations are historical exposures, not verified current party
membership. Known later leadership changes are kept outside party summaries.
"""

from collections import defaultdict
import statistics


def administrative_municipalities(rows, settlements):
    """Resolve electoral groups through EKATTE; Sofia's three RIK share a mayor."""
    places = {row['ekatte']: row['obshtina'] for row in settlements}
    codes = defaultdict(set)
    for row in rows:
        if str(row['regionId']) in {'23', '24', '25'}:
            codes[row['municipalityCode']].add('SOF46')
        elif code := places.get(row['settlementEkatte']):
            codes[row['municipalityCode']].add(code)
    if any(len(values) != 1 for values in codes.values()):
        raise ValueError('An electoral municipality maps to multiple administrative municipalities')
    return {key: next(iter(values)) for key, values in codes.items()}


def _summary(rows):
    eligible = [row for row in rows if row['eligible']]
    registered1 = sum(row['registered1'] for row in eligible)
    registered2 = sum(row['registered2'] for row in eligible)
    voted1 = sum(row['voted1'] for row in eligible)
    voted2 = sum(row['voted2'] for row in eligible)
    # Reuse the existing stable-list turnout screen, including its boundary tolerance.
    spikes = sum(bool(row['candidateReviewFlags']) for row in eligible)
    return {
        'sections': len(eligible), 'spikeN': spikes,
        'spikeRate': 100 * spikes / len(eligible) if eligible else None,
        'meanDeltaPp': statistics.mean(row['deltaTurnoutPp'] for row in eligible) if eligible else None,
        'deltaTurnoutPp': 100 * voted2 / registered2 - 100 * voted1 / registered1
                          if registered1 and registered2 else None,
        **{'candidate' + ballot + 'Delta': sum(change['deltaVotes'] for row in eligible
                                               for change in row['candidateChanges'] if change['id'] == ballot)
           for ballot in ['4', '25']},
    }


def mayor_analysis(rows, snapshot, administrative_codes, context):
    """Keep exact nominating coalitions separate and expose unmatched coverage."""
    mayors = {}
    for mayor in snapshot['municipalities']:
        code = mayor['administrativeCode']
        if code in mayors or not all(mayor.get(key) for key in ['name', 'mayor', 'party', 'sourceUrl']):
            raise ValueError('Duplicate or incomplete municipal mayor record: ' + code)
        mayors[code] = mayor
    changes = {}
    for change in context['changes']:
        if change['date'] <= '2026-11-01':
            code = change['administrativeCode']
            if code not in mayors:
                raise ValueError('Unknown municipality in mayor context: ' + code)
            if code not in changes or change['date'] > changes[code]['date']:
                changes[code] = change
    grouped = defaultdict(list)
    for row in rows:
        code = administrative_codes.get(row['municipalityCode'])
        grouped[code or 'unmatched:' + row['municipalityCode']].append(row)
    municipalities = []
    party_rows = defaultdict(list)
    party_municipalities = defaultdict(list)
    matched_sections = 0
    matched_municipalities = 0
    for code, members in sorted(grouped.items()):
        mayor = mayors.get(code)
        change = changes.get(code)
        usable = mayor is not None and change is None
        summary = _summary(members)
        municipalities.append({
            'code': code, 'name': mayor['name'] if mayor else members[0]['municipalityName'],
            'mayor': mayor['mayor'] if mayor else 'Неустановен',
            'party': mayor['party'] if mayor else 'Неустановена регистрация',
            'sourceUrl': mayor['sourceUrl'] if mayor else '',
            'affiliationUsable': usable,
            'contextNote': change['note'] if change else '' if mayor else 'Липсва съвпадение с данните за 2023 г.',
            'contextSourceUrl': change['sourceUrl'] if change else '', **summary,
        })
        if usable and summary['sections']:
            matched_municipalities += 1
            matched_sections += summary['sections']
            party_rows[mayor['party']].extend(members)
            party_municipalities[mayor['party']].append(summary)
    groups = []
    for party, members in party_rows.items():
        summaries = party_municipalities[party]
        deltas = [row['deltaTurnoutPp'] for row in summaries if row['deltaTurnoutPp'] is not None]
        groups.append({'party': party, 'municipalities': len(summaries), **_summary(members),
                       'medianMunicipalityDeltaPp': statistics.median(deltas) if deltas else None})
    metadata = snapshot['metadata']
    return {
        'basis': metadata['basis'], 'electionDate': metadata['electionDate'],
        'sourceUrl': metadata['sourceUrl'],
        'coverage': {'totalMunicipalities': len(grouped), 'matchedMunicipalities': matched_municipalities,
                     'eligibleSections': sum(row['eligible'] for row in rows),
                     'matchedSections': matched_sections,
                     'historicalOnlyMunicipalities': sum(row['code'] in changes for row in municipalities),
                     'noEligibleMunicipalities': sum(not row['sections'] for row in municipalities),
                     'unmatchedSections': sum(row['eligible'] for code, members in grouped.items()
                                              if code not in mayors for row in members)},
        'groups': sorted(groups, key=lambda row: (-row['municipalities'], row['party'])),
        'municipalities': sorted(municipalities, key=lambda row: row['name']),
        'limitations': [*metadata['limitations'],
            'Познатите последващи избори или прекратявания на мандат са изключени от партийните сборове. '
            'Списъкът не е изчерпателна проверка на длъжността към ноември 2026 г.',
            'София е една административна община с общ кмет; секциите от РИК 23, 24 и 25 се обединяват.',
            'Дяловете с рязък ръст и средните секционни промени тежат по секции; медианата на общинските '
            'промени дава еднаква тежест на общините. Партийните сборове са само от допустимите секции.',
            'Точните коалиционни регистрации се пазят отделно. ДПС от 2023 г. не се приписва на по-късни фракции.',
            'Описателно сравнение без статистически тест или корекция за начална активност, размер, '
            'демография и териториален състав. Малките групи не са надеждна база за общ партиен извод.',
            'Прирастите на кандидатските гласове са нетни промени и не установяват индивидуален избор, '
            'причинен ефект на кмета, организатор или нарушение.'],
    }
