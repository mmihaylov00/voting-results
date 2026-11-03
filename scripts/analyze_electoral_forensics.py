#!/usr/bin/env python3
"""Build the two hidden electoral-forensics reports from retained CIK records.

Run with the existing NumPy Python runtime, for example:
  /Users/mmihaylov/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
    scripts/analyze_electoral_forensics.py --archive 2026.10.25=/path/to/export.zip

No network requests or source data mutations are performed. Re-running with the
same source snapshots, seed and options produces the same JSON and CSV files.
"""

import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

from electoral_forensics_data import (ANALYSIS_DATES, FIRST_ROUND, SECOND_ROUND,
                                      PRIORITY_REGIONS, load_dataset, percentage)
from electoral_forensics_stats import (bh_adjust, collapse_sites, fixed_effect_model,
                                       matched_controls, mean_interval, spatial_test)
from electoral_forensics_candidates import THRESHOLD_TOLERANCE, candidate_analysis
from electoral_forensics_history import build_historical_benchmarks, build_runoff_benchmark


APRIL = '2026.04.19'
OCTOBER_2024 = '2024.10.27'
PARTY_REGISTRATIONS = {
    APRIL: {'gerb': '15', 'dps': '17'},
    OCTOBER_2024: {'gerb': '18', 'dps': '8'},
}
BIN_NAMES = {'under300': 'Под 300', '300to400': '300-400',
             '401to700': '401-700', 'over700': 'Над 700'}
ALTERNATIVES = [
    'Нормална мобилизация за балотаж и променен избор между кандидатите.',
    'Местни особености, демографски състав или организиране на транспорта, които не са измерени тук.',
    'Промени в списъците, дописани избиратели или разлика между подписалите се и намерените бюлетини.',
    'Грешка при въвеждане или несъпоставима секция, която изисква проверка на оригиналните протоколи.',
]


def difference(later, earlier):
    return later - earlier if later is not None and earlier is not None else None


def enrich_rows(panel, verified_dates=None):
    """Keep all rows auditable; declare a narrower arithmetic-valid inference sample."""
    for row in panel:
        first, second = row['elections'][FIRST_ROUND], row['elections'][SECOND_ROUND]
        row['priority'] = row['regionId'] in PRIORITY_REGIONS
        row['domestic'] = row['regionId'].isdigit() and 1 <= int(row['regionId']) <= 31
        for suffix, election in [('1', first), ('2', second)]:
            for name in ('registered', 'added', 'voted', 'turnout'):
                row[name + suffix] = election[name] if election else None
            row['method' + suffix] = election['votingMethod'] if election else 'unknown'
            row['addedPer100Voters' + suffix] = percentage(election['added'], election['voted']) if election else None
        row['deltaAdded'] = difference(row['added2'], row['added1'])
        row['addedReviewFlags'] = [date + ':' + flag
                                   for date, election in [(FIRST_ROUND, first), (SECOND_ROUND, second)]
                                   if election for flag in election.get('reviewFlags', [])]
        row['sizeGroup'] = first['sizeGroup'] if first else None
        row['small400'] = bool(first and 0 < first['registered'] <= 400)
        row['deltaVoted'] = difference(row['voted2'], row['voted1'])
        row['deltaTurnoutPp'] = difference(row['turnout2'], row['turnout1'])
        row['deltaTurnoutSensitivityPp'] = difference(second['turnoutWithAdded'], first['turnoutWithAdded']) \
            if first and second else None
        row['registeredChangePct'] = 100 * (second['registered'] - first['registered']) / first['registered'] \
            if first and second and first['registered'] else None
        arithmetic_flags = []
        for date, election in [(FIRST_ROUND, first), (SECOND_ROUND, second)]:
            if election:
                arithmetic_flags.extend(date + ':' + flag for flag in election['qualityFlags']
                                        if flag != 'unknown_voting_method')
        row['analysisExclusions'] = list(row['exclusionReasons']) + arithmetic_flags
        if not row['domestic']:
            row['analysisExclusions'].append('outside_domestic_sample')
        row['eligible'] = bool(row['domestic'] and row['comparableRoundPair'] and first and second
                               and first['registered'] > 0 and second['registered'] > 0
                               and not arithmetic_flags)
        row['candidateChanges'] = []
        if first and second:
            for ballot, current in sorted(second['votesByParty'].items(), key=lambda item: int(item[0])):
                earlier = first['votesByParty'].get(ballot)
                if not earlier or earlier['name'] != current['name']:
                    continue
                row['candidateChanges'].append({
                    'id': ballot, 'name': current['name'], 'votes1': earlier['total'],
                    'votes2': current['total'], 'deltaVotes': current['total'] - earlier['total'],
                    'share1': earlier['shareOfValidIncludingNoSupport'],
                    'share2': current['shareOfValidIncludingNoSupport'],
                    'deltaSharePp': difference(current['shareOfValidIncludingNoSupport'],
                                               earlier['shareOfValidIncludingNoSupport']),
                    'shareOfVoters1': earlier['shareOfVoters'], 'shareOfVoters2': current['shareOfVoters'],
                    'deltaShareOfVotersPp': difference(current['shareOfVoters'], earlier['shareOfVoters']),
                })
        if row['eligible'] and len(row['candidateChanges']) != 2:
            row['analysisExclusions'].append('finalist_identity_not_matched')
            row['eligible'] = False
        finalist1 = sum(candidate['votes1'] for candidate in row['candidateChanges'])
        finalist2 = sum(candidate['votes2'] for candidate in row['candidateChanges'])
        for candidate in row['candidateChanges']:
            candidate['finalistShare1'] = percentage(candidate['votes1'], finalist1) if len(row['candidateChanges']) == 2 else None
            candidate['finalistShare2'] = percentage(candidate['votes2'], finalist2) if len(row['candidateChanges']) == 2 else None
            candidate['deltaFinalistSharePp'] = difference(candidate['finalistShare2'], candidate['finalistShare1'])
            candidate['gainPer100Registered'] = percentage(candidate['deltaVotes'], row['registered1']) if first else None
        row['candidateReviewFlags'] = []
        if (row['eligible'] and abs(row['registeredChangePct']) <= 5 + THRESHOLD_TOLERANCE
                and row['deltaTurnoutPp'] >= 10 - THRESHOLD_TOLERANCE and row['deltaVoted'] >= 30):
            gains = {candidate['id']: candidate['deltaVotes'] for candidate in row['candidateChanges']}
            larger = 'yotova_gain_larger' if gains['25'] > gains['4'] else 'gyurov_gain_larger' if gains['4'] > gains['25'] else 'equal_gains'
            row['candidateReviewFlags'].append('joint_turnout_growth_' + larger)
        row['eliminatedCandidateVotes1'] = sum(value['total'] for ballot, value in first['votesByParty'].items()
                                               if ballot not in second['votesByParty']) if first and second else None
        row['history'] = {}
        for date, registrations in PARTY_REGISTRATIONS.items():
            election = row['elections'].get(date)
            if not election:
                row['history'][date] = {'matched': False, 'verified': date in (verified_dates or []),
                                         'eligibleForModel': False, 'parties': [], 'gerbShare': None, 'dpsShare': None}
                continue
            history = {'matched': row['matches'][date]['comparable'],
                       'parties': [{'id': value['id'], 'name': value['name'],
                                    'registrationId': value.get('registrationId', date + ':' + value['id']), 'votes': value['total'],
                                    'share': value['shareOfValidLists'], 'shareOfVoters': value['shareOfVoters']}
                                   for value in election['votesByParty'].values()]}
            history['verified'] = verified_dates is None or date in verified_dates
            history['eligibleForModel'] = bool(history['matched'] and history['verified'] and election['registered'] > 0
                                               and not any(flag != 'unknown_voting_method'
                                                           for flag in election['qualityFlags']))
            for family, ballot in registrations.items():
                entry = election['votesByParty'].get(ballot)
                history[family + 'Share'] = entry['shareOfValidLists'] if entry and history['matched'] else None
            history['registered'] = election['registered']
            history['voted'] = election['voted']
            history['turnout'] = election['turnout']
            row['history'][date] = history
        row['signal'] = {'peerN': 0, 'peerMedian': None, 'peerMad': None, 'robustZ': None,
                         'empiricalUpperTail': None, 'adjustedTail': None, 'flags': [],
                         'alternativeExplanations': ALTERNATIVES[:], 'neighborCount': 0,
                         'neighborMean': None, 'spatialP': None, 'spatialQ': None}
    return panel


def joint_totals(rows):
    """Use one complete eligible cohort for turnout, candidates and added-elector counts."""
    selected = [row for row in rows if row['eligible']]
    totals = {key: sum(row[key] for row in selected)
              for key in ['registered1', 'registered2', 'voted1', 'voted2', 'added1', 'added2']}
    totals.update(cohortN=len(selected), deltaVoted=totals['voted2'] - totals['voted1'],
                  deltaAdded=totals['added2'] - totals['added1'],
                  turnout1=percentage(totals['voted1'], totals['registered1']),
                  turnout2=percentage(totals['voted2'], totals['registered2']),
                  addedPer100Voters1=percentage(totals['added1'], totals['voted1']),
                  addedPer100Voters2=percentage(totals['added2'], totals['voted2']),
                  addedReviewN=sum(bool(row['addedReviewFlags']) for row in selected))
    totals['deltaTurnoutPp'] = difference(totals['turnout2'], totals['turnout1'])
    candidates = {}
    for row in selected:
        for candidate in row['candidateChanges']:
            total = candidates.setdefault(candidate['id'], {'id': candidate['id'], 'name': candidate['name'],
                                                             'votes1': 0, 'votes2': 0, 'deltaVotes': 0})
            for metric in ['votes1', 'votes2', 'deltaVotes']:
                total[metric] += candidate[metric]
    totals['candidateTotals'] = list(candidates.values())
    return totals


def base_features(row):
    size = math.log(row['registered1'])
    return [size, size ** 2, row['turnout1'], row['turnout1'] ** 2 / 100,
            row['registeredChangePct'], float(bool(row['rural']))]


BASE_NAMES = ['logRegistered', 'logRegisteredSquared', 'baselineTurnout', 'baselineTurnoutSquared',
              'registeredChangePct', 'rural']


def fit(rows, extra_names=(), extra=None, date=None, settlement_effects=False):
    selected = [row for row in rows if row['rural'] is not None
                and (not date or row['history'][date]['eligibleForModel'])]
    if not selected:
        return {'status': 'insufficient_support', 'n': 0, 'coefficients': {}, 'residuals': [], 'dropped': []}, []
    features = [base_features(row) + (extra(row) if extra else []) for row in selected]
    model = fixed_effect_model([row['deltaTurnoutPp'] for row in selected], features,
                               BASE_NAMES + list(extra_names), [row['municipalityCode'] for row in selected],
                               fixed_effects=[(row['municipalityCode'], row['settlementEkatte']) for row in selected]
                               if settlement_effects else None)
    return model, selected


def peer_screen(rows):
    """Exploratory robust scores, not model-based probabilities of misconduct."""
    indices = [defaultdict(list) for _ in range(3)]

    def stratum(row):
        change = row['registeredChangePct']
        return (row['sizeGroup'], row['rural'], row['method1'],
                int(row['turnout1'] // 20), -1 if change < -5 else 1 if change > 5 else 0)

    for row in rows:
        keys = [(row['municipalityCode'], stratum(row)), (row['regionId'], stratum(row)), stratum(row)]
        for index, key in zip(indices, keys):
            index[key].append(row['deltaTurnoutPp'])
    cache = {}
    for row in rows:
        if abs(row['registeredChangePct']) > 5:
            row['signal']['flags'].append('registered_electorate_change_over5pct')
        keys = [(row['municipalityCode'], stratum(row)), (row['regionId'], stratum(row)), stratum(row)]
        selected = next(((level, key, indices[level][key]) for level, key in enumerate(keys)
                         if len(indices[level][key]) >= 30), None)
        if not selected:
            continue
        level, key, values = selected
        cache_key = (level, key)
        if cache_key not in cache:
            median = statistics.median(values)
            mad = statistics.median(abs(value - median) for value in values)
            cache[cache_key] = (median, mad)
        median, mad = cache[cache_key]
        z = (row['deltaTurnoutPp'] - median) / (1.4826 * mad) if mad > 1e-9 else None
        signal = row['signal']
        signal.update(peerN=len(values), peerMedian=median, peerMad=mad, robustZ=z,
                      peerScope=['municipality', 'region', 'national'][level],
                      empiricalUpperTail=sum(value >= row['deltaTurnoutPp'] for value in values) / len(values))
        if z is not None and abs(z) >= 3 and abs(row['deltaTurnoutPp']) >= 10:
            signal['flags'].append('absolute_change_ge10pp_and_abs_robust_z_ge3')


def group_rows(rows, field):
    grouped = defaultdict(list)
    for row in rows:
        if field == 'settlementEkatte':
            key = row['municipalityCode'] + ':' + str(row['settlementEkatte'])
        else:
            key = str(row[field])
        grouped[key].append(row)
    result = []
    for key, members in sorted(grouped.items(), key=lambda item: int(item[0]) if field == 'regionId' else item[0]):
        eligible = [row for row in members if row['eligible']]
        first = members[0]
        name_field = {'regionId': 'regionName', 'municipalityCode': 'municipalityName',
                      'settlementEkatte': 'settlementName'}.get(field)
        registered1 = sum(row['registered1'] for row in eligible)
        registered2 = sum(row['registered2'] for row in eligible)
        voted1 = sum(row['voted1'] for row in eligible)
        voted2 = sum(row['voted2'] for row in eligible)
        turnout1 = 100 * voted1 / registered1 if registered1 else None
        turnout2 = 100 * voted2 / registered2 if registered2 else None
        interval = mean_interval([row['deltaTurnoutPp'] for row in eligible],
                                 [row['municipalityCode'] for row in eligible])
        result.append({'key': key, 'name': first[name_field] if name_field else BIN_NAMES.get(key, key),
                       **joint_totals(eligible),
                       'region': first['regionName'], 'regionId': first['regionId'],
                       'municipalityCode': first['municipalityCode'],
                       'settlementEkatte': first['settlementEkatte'], 'n': len(members),
                       'registered1': registered1, 'registered2': registered2, 'voted1': voted1, 'voted2': voted2,
                       'turnout1': turnout1, 'turnout2': turnout2,
                       'deltaTurnoutPp': difference(turnout2, turnout1), 'meanDeltaPp': interval['mean'],
                       'meanDeltaCi95': interval['ci95'], 'municipalityClusters': interval['clusters'],
                       'deltaVoted': voted2 - voted1, 'eligibleN': len(eligible),
                       'excludedN': len(members) - len(eligible),
                       'flaggedN': sum(bool(row['signal']['flags']) for row in eligible),
                       'smallN': sum(row['small400'] for row in eligible),
                       'paperN': sum(row['method1'] == 'paper' for row in eligible),
                       'machineN': sum(row['method1'] == 'machine' for row in eligible),
                       'unknownMethodN': sum(row['method1'] == 'unknown' for row in eligible)})
    return result


def hypothesis(identifier, title, model=None, term=None, summary='', **extra):
    coefficient = model.get('coefficients', {}).get(term) if model else None
    return {'id': identifier, 'title': title, 'status': 'estimated' if coefficient else 'descriptive',
            'summary': summary, 'n': model.get('n', 0) if model else extra.pop('n', 0),
            'estimate': coefficient['estimate'] if coefficient else None, 'unit': 'процентни пункта',
            'ci95': coefficient['ci95'] if coefficient else None, 'p': coefficient['p'] if coefficient else None,
            'q': None, 'method': model.get('method', '') if model else '',
            'limitations': model.get('limitations', []) if model else [],
            'details': {key: value for key, value in (model or {}).items() if key != 'residuals'}, **extra}


def method_overlap(rows):
    """Only within-settlement comparisons count as overlap for H3."""
    stable = [row for row in rows if row['method1'] == row['method2']
              and row['method1'] in ('paper', 'machine') and row['rural'] is not None
              and row['settlementEkatte']]
    strata = defaultdict(list)
    for row in stable:
        strata[(row['municipalityCode'], row['settlementEkatte'], row['sizeGroup'], row['rural'],
                int(row['turnout1'] // 20))].append(row)
    overlap = [row for members in strata.values() if len({row['method1'] for row in members}) == 2
               for row in members]
    return stable, overlap


def analyze_hypotheses(rows):
    h1_model, rural_rows = fit([row for row in rows if row['rural']], ['small400'],
                              lambda row: [float(row['small400'])])
    h1 = hypothesis('H1', 'Малки селски секции и промяна в активността', h1_model, 'small400',
                    'Сравнение в рамките на община само между селски секции; контрол за размер, '
                    'начална активност и промяна на списъка.')
    h1['details']['ruralSectionN'] = len(rural_rows)
    h1['details']['smallN'] = sum(row['small400'] for row in rural_rows)
    h1['details']['descriptiveGroups'] = []
    for rural in (True, False):
        for small in (True, False):
            members = [row for row in rows if row['rural'] is rural and row['small400'] is small]
            interval = mean_interval([row['deltaTurnoutPp'] for row in members],
                                     [row['municipalityCode'] for row in members])
            h1['details']['descriptiveGroups'].append({'rural': rural, 'small400': small, 'n': len(members),
                                                       'meanDeltaPp': interval['mean'], 'ci95': interval['ci95'],
                                                       'municipalities': interval['clusters']})
    h1['limitations'].append('Малкият размер е свързан с метода на гласуване; отделното сравнение на методите е в H3.')
    if 'small400' not in h1_model.get('coefficients', {}):
        h1.update(status='not_identifiable', summary=h1['summary'] +
                  ' В тази извадка няма достатъчна вариация между малки и големи селски секции.')
    historical = [row for row in rows if row['history'][APRIL]['eligibleForModel']
                  and row['history'][APRIL]['gerbShare'] is not None
                  and row['history'][APRIL]['dpsShare'] is not None]
    h2_model, _ = fit(historical, ['gerbSharePer10pp', 'dpsSharePer10pp', 'previousTurnout'],
                     lambda row: [row['history'][APRIL]['gerbShare'] / 10,
                                  row['history'][APRIL]['dpsShare'] / 10,
                                  row['history'][APRIL]['turnout'] or 0], date=APRIL)
    h2 = hypothesis('H2', 'Исторически резултати на точните партийни регистрации', h2_model,
                    summary='Асоциации за ГЕРБ-СДС (15) и Движение за права и свободи - ДПС (17) '
                    'от 19.04.2026, за всеки 10 пр.п. исторически дял; общински ефекти и начални контроли.')
    h2_p = [h2_model.get('coefficients', {}).get(term, {}).get('p')
            for term in ['gerbSharePer10pp', 'dpsSharePer10pp']]
    if all(value is not None for value in h2_p):
        h2.update(status='estimated', p=min(1, 2 * min(h2_p)),
                  unit='пр.п. промяна в активността за 10 пр.п. исторически партиен дял')
    h2['details']['omnibusMethod'] = 'Минималната от две предварително определени p стойности, коригирана по Bonferroni.'
    h2['details']['highShareThreshold'] = 50
    h2['details']['highShareGroups'] = []
    for party in ['gerb', 'dps']:
        high = [row for row in historical if row['history'][APRIL][party + 'Share'] >= 50]
        other = [row for row in historical if row['history'][APRIL][party + 'Share'] < 50]
        high_interval = mean_interval([row['deltaTurnoutPp'] for row in high], [row['municipalityCode'] for row in high])
        other_interval = mean_interval([row['deltaTurnoutPp'] for row in other], [row['municipalityCode'] for row in other])
        h2['details']['highShareGroups'].append({
            'party': party, 'highN': len(high), 'otherN': len(other),
            'highMeanDeltaPp': high_interval['mean'], 'highCi95': high_interval['ci95'],
            'otherMeanDeltaPp': other_interval['mean'], 'otherCi95': other_interval['ci95'],
            'highMunicipalities': high_interval['clusters'], 'otherMunicipalities': other_interval['clusters']})
    old = [row for row in rows if row['history'][OCTOBER_2024]['eligibleForModel']
           and row['history'][OCTOBER_2024]['gerbShare'] is not None
           and row['history'][OCTOBER_2024]['dpsShare'] is not None]
    old_model, _ = fit(old, ['gerb2024Per10pp', 'dpsNovoNachalo2024Per10pp', 'previousTurnout'],
                       lambda row: [row['history'][OCTOBER_2024]['gerbShare'] / 10,
                                    row['history'][OCTOBER_2024]['dpsShare'] / 10,
                                    row['history'][OCTOBER_2024]['turnout'] or 0], date=OCTOBER_2024)
    h2['details']['historicalSensitivity'] = {key: value for key, value in old_model.items() if key != 'residuals'}
    if not old:
        h2['details']['historicalSensitivity']['explanation'] = (
            'Допълнителният модел за 2024 не се изчислява без проверен официален архив и съпоставими валидни записи. '
            'Съществуващите канонични записи се пазят отделно с отбелязана проверка.')
    h2['limitations'].append('ДПС-Ново начало (2024) е отделна регистрация и не е обединена с ДПС (2026) или АПС.')

    method_rows, overlap = method_overlap(rows)
    arms = Counter(row['method1'] for row in overlap)
    municipalities = len({row['municipalityCode'] for row in overlap})
    support = len(overlap) >= 50 and arms['paper'] >= 20 and arms['machine'] >= 20 and municipalities >= 10
    method_model, _ = fit(overlap, ['machine'], lambda row: [float(row['method1'] == 'machine')],
                           settlement_effects=True) if support \
        else ({'n': len(overlap), 'coefficients': {}, 'limitations': []}, [])
    h3 = hypothesis('H3', 'Метод на гласуване и обща подкрепа между групите', method_model, 'machine',
                    'Стабилен метод в двата тура; обща подкрепа в едно и също населено място, община, '
                    'размер и начална активност; при достатъчно данни моделът използва фиксирани ефекти '
                    'за населено място и неопределеност по общински клъстери.')
    h3['details'].update(stableMethodN=len(method_rows), overlapN=len(overlap), overlapArms=dict(arms),
                         overlapMunicipalities=municipalities, minimumSupport={'n': 50, 'eachArm': 20, 'municipalities': 10},
                         overlapSettlements=len({(row['municipalityCode'], row['settlementEkatte']) for row in overlap}),
                         descriptive=group_rows(method_rows, 'method1'))
    if not support or 'machine' not in method_model.get('coefficients', {}):
        h3.update(status='not_identifiable', p=None, estimate=None, ci95=None)
    h3['limitations'].extend(['Методът е силно свързан с размера и правилото за 300 избиратели.',
                             'Секции в различни населени места не се броят като обща подкрепа за H3. '
                             'При недостатъчно припокриване в едно населено място няма надежден отделен ефект на метода.',
                             'Дори при припокриване коефициентът е асоциация, а не причинен ефект.'])
    h5 = hypothesis('H5', 'Нормална балотажна мобилизация и алтернативни обяснения', n=len(rows),
                    summary='Описателна проверка на дописаните избиратели, изменението на списъците, '
                    'отпадналите кандидати и сходните контролни секции; механизмът не се установява от резултати.')
    h5['details'] = {'registeredChangedN': sum(row['registered1'] != row['registered2'] for row in rows),
                    'registeredChangedOver5PctN': sum(abs(row['registeredChangePct']) > 5 for row in rows),
                    'positiveTurnoutDeltaN': sum(row['deltaTurnoutPp'] > 0 for row in rows),
                    'eliminatedCandidateVotes1': sum(row['eliminatedCandidateVotes1'] or 0 for row in rows),
                    'signedVoterDelta': sum(row['deltaVoted'] for row in rows),
                    'meanDeltaSensitivityPp': statistics.mean(row['deltaTurnoutSensitivityPp'] for row in rows) if rows else None}
    joint = joint_totals(rows)
    h5['details']['addedElectors'] = {key: joint[key] for key in
                                     ['added1', 'added2', 'deltaAdded', 'addedPer100Voters1',
                                      'addedPer100Voters2', 'addedReviewN']}
    h5['details']['candidateTotals'] = joint['candidateTotals']
    h5['limitations'] = ['Не се прави индивидуален трансфер на гласове от агрегирани секционни данни.',
                         'Това не е тест, който доказва или отхвърля натиск, организатор или нарушение.']
    return [h1, h2, h3, h5]


def spatial_clusters(spatial, rows):
    lookup = {row['sectionId']: row for row in rows}
    sites = {site['id']: site for site in spatial['sites']}
    for site in sites.values():
        for section_id in site['sectionIds']:
            row = lookup[section_id]
            row['signal'].update(neighborCount=site['neighborCount'], neighborMean=site['neighborResidualMean'],
                                 spatialP=site['p'], spatialQ=site['q'], spatialSiteId=site['id'])
            if site['q'] is not None and site['q'] <= .05:
                row['signal']['flags'].append('spatial_concordance_bh_q_le0.05')
    clusters = []
    adjacency = {key: set() for key in sites}
    for key, site in sites.items():
        for other in site['neighborIds']:
            adjacency[key].add(other)
            adjacency[other].add(key)
    # The weaker p<=.01 groups remain explicitly exploratory when no FDR group exists.
    for kind, selected in [('fdr', {key for key, site in sites.items() if site['q'] is not None and site['q'] <= .05}),
                            ('exploratory', {key for key, site in sites.items() if site['p'] is not None and site['p'] <= .01
                                             and (site['q'] is None or site['q'] > .05)})]:
        while selected:
            pending = [min(selected)]
            component = set()
            while pending:
                key = pending.pop()
                if key not in selected:
                    continue
                selected.remove(key)
                component.add(key)
                sign = sites[key]['residual'] >= 0
                pending.extend(other for other in adjacency[key] if other in selected
                               and (sites[other]['residual'] >= 0) == sign)
            if len(component) < 2:
                continue
            members = [sites[key] for key in sorted(component)]
            section_ids = sorted({sid for site in members for sid in site['sectionIds']})
            first = members[0]
            clusters.append({'id': f'{kind}-{len(clusters) + 1:03d}', 'sectionIds': section_ids,
                             'siteCount': len(members), 'sectionCount': len(section_ids),
                             'regionName': first['regionName'], 'municipalityName': first['municipalityName'],
                             'meanDeltaPp': statistics.mean(site['deltaTurnoutPp'] for site in members),
                             'p': min(site['p'] for site in members), 'q': max(site['q'] for site in members),
                             'status': kind, 'definition': 'Свързани сигнали с еднакъв знак в предварително определената мрежа на близки места.',
                             'limitations': ['p и q се отнасят за отделните места; клъстерът няма отделен статистически тест.',
                                             'Проучвателните групи с p<=.01 не са преминали националния FDR праг.',
                                             'Секциите с еднакви координати се броят като едно място.']})
    return sorted(clusters, key=lambda cluster: (cluster['status'] != 'fdr', -cluster['siteCount'], cluster['id']))


def findings_for(rows):
    result = []
    for row in rows:
        if not row['signal']['flags']:
            continue
        signal = row['signal']
        result.append({key: row[key] for key in ['sectionId', 'regionName', 'municipalityName', 'settlementName',
                                                'deltaTurnoutPp', 'deltaVoted', 'registered1', 'registered2',
                                                'voted1', 'voted2', 'turnout1', 'turnout2', 'priority', 'small400']})
        finding = result[-1]
        finding.update(robustZ=signal['robustZ'], peerN=signal['peerN'], peerMedian=signal['peerMedian'],
                       criteria=signal['flags'], spatialQ=signal['spatialQ'],
                       calculations=[f"100 × {row['voted1']} / {row['registered1']} = {row['turnout1']:.6f}%",
                                     f"100 × {row['voted2']} / {row['registered2']} = {row['turnout2']:.6f}%",
                                     f"Разлика: {row['deltaTurnoutPp']:.6f} пр.п.; гласували: {row['deltaVoted']:+d}.",
                                     f"Промяна на списъка: {row['registeredChangePct']:.6f}%."],
                       alternativeExplanations=ALTERNATIVES[:],
                       sourceUrls={'round1': row['elections'][FIRST_ROUND]['sourceUrls'],
                                   'round2': row['elections'][SECOND_ROUND]['sourceUrls']},
                       candidateChanges=row['candidateChanges'], historicalSupport=row['history'][APRIL])
        if signal['robustZ'] is not None:
            finding['calculations'].append(f"Robust z = (Δ - {signal['peerMedian']:.6f}) / "
                                           f"(1.4826 × {signal['peerMad']:.6f}) = {signal['robustZ']:.6f}; "
                                           f"сравнима група n={signal['peerN']}.")
    return sorted(result, key=lambda row: (-abs(row['robustZ'] or 0),
                                          -abs(row['deltaTurnoutPp']), row['sectionId']))


def review_rows(rows, flag_field):
    fields = ['sectionId', 'regionId', 'regionName', 'municipalityName', 'settlementName',
              'registered1', 'registered2', 'voted1', 'voted2', 'deltaVoted', 'deltaTurnoutPp',
              'added1', 'added2', 'deltaAdded', 'addedPer100Voters1', 'addedPer100Voters2',
              'addedReviewFlags', 'candidateReviewFlags', 'candidateChanges', 'eligible', 'small400']
    return [{key: row[key] for key in fields} for row in rows if row[flag_field]]


def query_block(identifier, title, selected, controls, findings, clusters):
    eligible = [row for row in selected if row['eligible']]
    interval = mean_interval([row['deltaTurnoutPp'] for row in eligible], [row['municipalityCode'] for row in eligible])
    comparison = matched_controls(eligible, controls)
    selected_ids = {row['sectionId'] for row in eligible}
    selected_findings = [finding for finding in findings if finding['sectionId'] in selected_ids]
    selected_clusters = [dict(cluster, targetSectionIds=sorted(selected_ids.intersection(cluster['sectionIds'])),
                             targetSectionCount=len(selected_ids.intersection(cluster['sectionIds'])))
                         for cluster in clusters if selected_ids.intersection(cluster['sectionIds'])]
    summary = {**joint_totals(eligible), 'sections': len(selected), 'eligibleSections': len(eligible),
               'excludedSections': len(selected) - len(eligible), 'meanDeltaPp': interval['mean'],
               'meanDeltaCi95': interval['ci95'], 'municipalityClusters': interval['clusters'],
               'positiveDeltaN': sum(row['deltaTurnoutPp'] > 0 for row in eligible),
               'reviewN': len(selected_findings), 'clusterN': len(selected_clusters),
               'unknownMethodN': sum(row['method1'] == 'unknown' or row['method2'] == 'unknown' for row in eligible),
               'addedEligibleReviewN': sum(bool(row['addedReviewFlags']) for row in eligible),
               'addedReviewN': sum(bool(row['addedReviewFlags']) for row in selected),
               'candidateReviewN': sum(bool(row['candidateReviewFlags']) for row in eligible)}
    return {'id': identifier, 'title': title,
            'filter': 'Цялата страна; 1-400 избиратели по списък totalA на първия тур' if identifier == 'query2'
                      else 'Цялата страна; всички размери; 31 избирателни района на ЦИК',
            'summary': summary, 'regions': group_rows(selected, 'regionId'),
            'municipalities': group_rows(selected, 'municipalityCode'),
            'settlements': group_rows(selected, 'settlementEkatte'),
            'binSummary': group_rows(selected, 'sizeGroup'), 'methodSummary': group_rows(selected, 'method1'),
            'findings': [finding['sectionId'] for finding in selected_findings],
            'clusterIds': [cluster['id'] for cluster in selected_clusters],
            'clusters': selected_clusters,
            'candidateAnalysis': candidate_analysis(selected),
            'candidateReview': review_rows(selected, 'candidateReviewFlags'),
            'addedElectorReview': review_rows(selected, 'addedReviewFlags'),
            'comparison': comparison,
            'report': {
                'facts': [f"31 избирателни района на ЦИК; {len(selected)} секции, {len(eligible)} съпоставими и валидни.",
                          'Размер и активност по totalA; дописаните totalB са отделни. Балотажът е предварителна публикация.'],
                'observations': [f"Положителна промяна: {summary['positiveDeltaN']} секции. "
                                 f"За проверка на протоколи: {len(selected_findings)}.",
                                 f"Контроли извън собствения район: {comparison['matchedN']} от {comparison['targetN']} секции."],
                'hypotheses': ['Мобилизация, променен кандидатски избор и местни особености остават възможни обяснения.',
                               'Резултатите не доказват организатор, натиск, нарушение или индивидуален трансфер.']}}


def write_csv(path, rows):
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
                         if isinstance(value, (dict, list)) else value for key, value in row.items()} for row in rows)


def section_csv_rows(rows):
    for row in rows:
        flat = {key: row[key] for key in ['sectionId', 'regionId', 'regionName', 'municipalityCode',
                                        'municipalityName', 'settlementEkatte', 'settlementName', 'address',
                                        'rural', 'special', 'eligible', 'priority', 'small400', 'sizeGroup',
                                        'registered1', 'registered2', 'registeredChangePct', 'voted1', 'voted2',
                                        'turnout1', 'turnout2', 'deltaTurnoutPp', 'deltaTurnoutSensitivityPp',
                                        'deltaVoted', 'method1', 'method2', 'analysisExclusions',
                                        'added1', 'added2', 'deltaAdded', 'addedPer100Voters1', 'addedPer100Voters2',
                                        'addedReviewFlags', 'candidateReviewFlags']}
        for key in ['peerN', 'peerMedian', 'peerMad', 'robustZ', 'empiricalUpperTail', 'spatialP', 'spatialQ', 'flags']:
            flat[key] = row['signal'][key]
        for candidate in row['candidateChanges']:
            for metric in ['votes1', 'votes2', 'deltaVotes', 'share1', 'share2', 'deltaSharePp',
                           'shareOfVoters1', 'shareOfVoters2', 'deltaShareOfVotersPp',
                           'finalistShare1', 'finalistShare2', 'deltaFinalistSharePp', 'gainPer100Registered']:
                flat['candidate_' + candidate['id'] + '_' + metric] = candidate[metric]
        for date, election in row['elections'].items():
            if election:
                flat[date + '_source'] = election['sourceUrls']['canonical']
                flat[date + '_protocol'] = election['sourceUrls']['protocol']
                flat[date + '_registered'] = election['registered']
                flat[date + '_added'] = election['added']
                flat[date + '_voted'] = election['voted']
                flat[date + '_noSupport'] = election['noSupport']
                flat[date + '_invalid'] = election['invalidVotes']
                if date in PARTY_REGISTRATIONS:
                    flat[date + '_matched'] = row['history'][date]['matched']
                    # Exact ballot registrations stay distinct by date and regional scope.
                    for ballot, party in election['votesByParty'].items():
                        prefix = date + '_' + party.get('registrationId', ballot) + '_' + party['name']
                        flat[prefix + '_votes'] = party['total']
                        flat[prefix + '_valid_list_share_pct'] = party['shareOfValidLists']
                        flat[prefix + '_signed_voter_share_pct'] = party['shareOfVoters']
        yield flat


def clean_json(value):
    if isinstance(value, dict):
        return {key: clean_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(item) for item in value]
    if isinstance(value, float):
        return (round(value, 10) if abs(value) >= 1e-8 else value) if math.isfinite(value) else None
    return value


def build_report(dataset, permutations=999, seed=20261101, historical_benchmarks=None):
    verified_dates = {date for date, election in dataset['elections'].items()
                      if election['metadata'].get('canonicalArchiveVerification') == 'verified'}
    rows = enrich_rows(dataset['rows'], verified_dates)
    domestic = [row for row in rows if row['domestic']]
    eligible = [row for row in domestic if row['eligible']]
    peer_screen(eligible)
    hypotheses = analyze_hypotheses(eligible)
    residual_model, model_rows = fit(eligible)
    spatial = spatial_test(collapse_sites(model_rows, residual_model['residuals']), permutations, seed)
    clusters = spatial_clusters(spatial, eligible)
    h4 = hypothesis('H4', 'Териториално сходство между различни места за гласуване',
                    summary='Условни пермутации на остатъците след общински ефекти и начални контроли.',
                    n=spatial['testedSites'])
    h4.update(status='estimated' if spatial['globalP'] is not None else 'insufficient_support',
              p=spatial['globalP'], method=spatial.get('method', ''), limitations=spatial.get('limitations', []),
              details={key: value for key, value in spatial.items() if key != 'sites'})
    hypotheses.insert(3, h4)
    for hypothesis_row, q in zip(hypotheses, bh_adjust([entry['p'] for entry in hypotheses])):
        hypothesis_row['q'] = q
    findings = findings_for(eligible)
    focus = [row for row in domestic if row['small400']]
    query1 = query_block('query1', 'Секционен анализ за цялата страна', domestic, eligible, findings, clusters)
    query2 = query_block('query2', 'Секции до 400 избиратели в цялата страна', focus, eligible, findings, clusters)
    historical_benchmarks = historical_benchmarks or {'query1': [], 'query2': [], 'metadata': {}}
    for query, selected in [(query1, domestic), (query2, focus)]:
        current_benchmark = build_runoff_benchmark(
            dataset['elections'][FIRST_ROUND], dataset['elections'][SECOND_ROUND],
            cycle=2026, round1_date=FIRST_ROUND, round2_date=SECOND_ROUND,
            small400=query['id'] == 'query2',
            sources=[{'date': date, 'sourceUrl': dataset['elections'][date]['metadata']['sourceUrl'],
                      'canonicalArchiveVerification': dataset['elections'][date]['metadata']['canonicalArchiveVerification'],
                      'tableHashes': {name: table['sha256'] for name, table in dataset['provenance'][date]['tables'].items()}}
                     for date in [FIRST_ROUND, SECOND_ROUND]])
        if current_benchmark['n'] != query['summary']['eligibleSections']:
            raise ValueError('Historical benchmark and current analysis use different 2026 cohorts')
        query['historicalRunoffs'] = historical_benchmarks[query['id']] + [current_benchmark]
        query['hypotheses'] = hypotheses if query['id'] == 'query1' else analyze_hypotheses(
            [row for row in selected if row['eligible']])
        if query['id'] == 'query2':
            for entry, adjusted in zip(query['hypotheses'], bh_adjust([entry['p'] for entry in query['hypotheses']])):
                entry['q'] = adjusted
        query['hypothesisScope'] = query['filter']
        query['spatialSummary'] = {
            'scope': 'Националните локални тестове се коригират заедно; тук са показани само местата в избрания обхват.',
            'testedSections': sum(row['signal']['spatialP'] is not None for row in selected if row['eligible']),
            'fdrSections': sum(row['signal']['spatialQ'] is not None and row['signal']['spatialQ'] <= .05
                               for row in selected if row['eligible']),
        }
        local_sites = {row['signal'].get('spatialSiteId') for row in selected if row['eligible']
                       and row['signal']['spatialP'] is not None}
        query['spatialSummary'].update(testedSites=len(local_sites), clusterCount=len(query['clusters']),
                                       fdrSites=len({row['signal'].get('spatialSiteId') for row in selected
                                                     if row['eligible'] and row['signal']['spatialQ'] is not None
                                                     and row['signal']['spatialQ'] <= .05}))
        if query['id'] == 'query2':
            scoped_h4 = hypothesis('H4', 'Териториално сходство в малките секции', n=len(local_sites),
                                   summary='Локални тестове от общата национална мрежа; '
                                   'BH корекция за всички тествани места в страната, без нов общ тест за малките секции.')
            scoped_h4['details'] = query['spatialSummary']
            scoped_h4['method'] = spatial.get('method', '')
            scoped_h4['limitations'] = spatial.get('limitations', [])
            query['hypotheses'].insert(3, scoped_h4)
        h2 = next(entry for entry in query['hypotheses'] if entry['id'] == 'H2')
        if h2['q'] is not None:
            signal = 'статистическа асоциация' if h2['q'] <= .05 else 'без статистически сигнал след корекция'
            query['report']['observations'].append(f"H2: {signal} (q={h2['q']:.3f}; n={h2['n']}).")
        query['report']['observations'].append(
            f"Пространствени сигнали след националната корекция: {query['spatialSummary']['fdrSites']} места.")
    query2['selectionSensitivity'] = {
        'basis': 'Членството се определя от totalA на първия тур, не от броя гласували.',
        'r1SmallN': sum(row['registered1'] <= 400 for row in eligible),
        'r2SmallN': sum(row['registered2'] <= 400 for row in eligible),
        'bothSmallN': sum(row['registered1'] <= 400 and row['registered2'] <= 400 for row in eligible),
        'r1OnlySmallN': sum(row['registered1'] <= 400 < row['registered2'] for row in eligible),
        'r2OnlySmallN': sum(row['registered2'] <= 400 < row['registered1'] for row in eligible),
        'r2SmallMeanDeltaPp': statistics.mean(row['deltaTurnoutPp'] for row in eligible
                                              if row['registered2'] <= 400) if any(row['registered2'] <= 400
                                                                                 for row in eligible) else None,
    }
    selection = query2['selectionSensitivity']
    if selection['r2SmallMeanDeltaPp'] is not None and query2['summary']['meanDeltaPp'] is not None:
        query2['report']['observations'].append(
            f"Праг по балотажа: {selection['r2SmallN']} секции, средно {selection['r2SmallMeanDeltaPp']:.2f} пр.п.; "
            f"по първия тур: {selection['r1SmallN']}, {query2['summary']['meanDeltaPp']:.2f} пр.п.")
    metadata = {'title': 'Electoral Forensics - Bulgaria 2026',
                'dates': {'parliamentary': APRIL, 'round1': FIRST_ROUND, 'round2': SECOND_ROUND,
                          'historical': OCTOBER_2024}, 'priorityRegionIds': sorted(PRIORITY_REGIONS, key=int),
                'scope': 'nationwide_domestic',
                'geography': {'type': 'cik_electoral_district', 'count': 31,
                              'label': 'Избирателни райони на ЦИК',
                              'definition': '31 избирателни района, включително отделните райони в София и Пловдив; не са 28 административни области.'},
                'percentUnits': 'Активност и дялове в 0-100%; промени в процентни пункта.',
                'seed': seed, 'permutations': permutations, 'provisional': True,
                'generatedBy': 'scripts/analyze_electoral_forensics.py', 'sectionCount': len(domestic),
                'eligibleCount': len(eligible),
                'analysisCodeHashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                       for path in [Path(__file__), Path(__file__).with_name('electoral_forensics_stats.py'),
                                                    Path(__file__).with_name('electoral_forensics_data.py'),
                                                    Path(__file__).with_name('electoral_forensics_candidates.py'),
                                                    Path(__file__).with_name('electoral_forensics_history.py')]},
                'inputHashes': {date: {name: table['sha256'] for name, table in value['tables'].items()}
                                for date, value in dataset['provenance'].items()}}
    quality = dict(dataset['quality'])
    quality.update(domesticSections=len(domestic), eligibleSections=len(eligible),
                   unionAllSections=len(rows), outsideDomesticSections=len(rows) - len(domestic),
                   domesticComparablePairs=sum(row['comparableRoundPair'] for row in domestic),
                   domesticIneligibleArithmeticPairs=sum(row['comparableRoundPair'] and not row['eligible'] for row in domestic),
                   analysisExclusions=dict(Counter(reason for row in domestic if not row['eligible']
                                                   for reason in row['analysisExclusions'])),
                   mappedEligibleSections=sum(row['coordinates'] is not None for row in eligible),
                   distinctSpatialSites=len(spatial['sites']), testedSpatialSites=spatial['testedSites'])
    quality['addedElectorReviewSections'] = len(review_rows(domestic, 'addedReviewFlags'))
    quality['sizeBinMigration'] = dict(Counter(row['sizeGroup'] + ' -> ' + row['elections'][SECOND_ROUND]['sizeGroup']
                                              for row in eligible))
    relaxed = [row for row in domestic if row['comparableRoundPair']
               and all(election and election['registered'] > 0
                       and election['voted'] <= election['electorateWithAdded']
                       and election['totalCandidateVotes'] + election['noSupport'] <= election['voted']
                       for election in [row['elections'][FIRST_ROUND], row['elections'][SECOND_ROUND]])]
    sensitivity = {}
    for scope, strict_rows, relaxed_rows in [
            ('national', eligible, relaxed),
            ('query1', eligible, relaxed),
            ('query2', [row for row in focus if row['eligible']],
             [row for row in relaxed if row['small400']])]:
        models = analyze_hypotheses(relaxed_rows)
        sensitivity[scope] = {
            'strictN': len(strict_rows), 'relaxedN': len(relaxed_rows),
            'additionalN': len(relaxed_rows) - len(strict_rows),
            'strictMeanDeltaPp': statistics.mean(row['deltaTurnoutPp'] for row in strict_rows) if strict_rows else None,
            'relaxedMeanDeltaPp': statistics.mean(row['deltaTurnoutPp'] for row in relaxed_rows) if relaxed_rows else None,
            'relaxedDeltaVoted': sum(row['deltaVoted'] for row in relaxed_rows),
            'hypotheses': [entry for entry in models if entry['id'] in ('H1', 'H2')],
        }
    report = {'metadata': metadata, 'definitions': dataset['definitions'], 'quality': quality,
              'provenance': dataset['provenance'],
              'registrations': {date: {'parties': election['parties'],
                                       'regionalParties': election.get('regionalParties', {})}
                                for date, election in dataset['elections'].items()},
              'query1': query1, 'query2': query2,
              'sampleSensitivity': {'rule': 'Разширената извадка допуска разлика между подписали се и намерени '
                                    'бюлетини; изисква съвпадаща секция, положителен totalA, гласували <= totalA+totalB '
                                    'и всички действителни гласове (вкл. НПН) <= подписалите се, във всеки тур.',
                                    'results': sensitivity},
              'regions': group_rows(domestic, 'regionId'), 'municipalities': group_rows(domestic, 'municipalityCode'),
              'settlements': group_rows(domestic, 'settlementEkatte'),
              'hypotheses': hypotheses, 'clusters': clusters, 'findings': findings,
              'addedElectorFindings': review_rows(domestic, 'addedReviewFlags'),
              'candidateFindings': review_rows(domestic, 'candidateReviewFlags'),
              'historicalBenchmarkMetadata': historical_benchmarks['metadata'],
              'methodology': {
                  'scope': 'Съпоставими редовни секции в страната без аритметични противоречия; променените, специалните и липсващите записи се пазят с причина за изключване.',
                  'geography': 'Регионалните обобщения използват 31 избирателни района на ЦИК, не 28 административни области. Четирите първоначални приоритетни района са само исторически метаданни.',
                  'size': 'Избиратели totalA на първия тур: <300, 300-400, 401-700, >700. Фокусът включва всички секции <=400, включително градските.',
                  'turnout': '100 * подписали се / totalA за всеки тур; отделна проверка с totalA+totalB.',
                  'candidateShares': 'Гласове за кандидат / (всички кандидатски гласове + НПН); отделно дял от подписалите се.',
                  'finalistShares': 'Гласове за кандидат / гласове за двамата финалисти. Промяната отделя баланса '
                                    'между тях от отпадането на другите кандидатури. Не установява индивидуален избор.',
                  'candidateScreen': 'Проучвателен подбор: допустима секция, промяна на списъка до ±5%, '
                                     'ръст на активността поне 10 пр.п. и поне 30 повече подписали се. '
                                     'По-големият кандидатски ръст не означава установен избор на нови избиратели.',
                  'addedReview': 'Дописани над подписалите се е отделен сигнал за документална проверка, '
                                 'без автоматично изключване или корекция на оригиналните бройки.',
                  'historicShares': 'Точните регистрации на конкретните избори; дял от действителните гласове за листи без НПН.',
                  'highHistoricalShare': 'Предварително определен праг >=50% за всяка априлска регистрация поотделно; непрекъснат анализ за 10 пр.п. дял.',
                  'models': 'Линейни модели с общински ефекти; логаритъм и квадрат на логаритъма на списъка, начална активност и нейния квадрат, промяна на списъка, град/село; H2 добавя предишна активност. H3 изисква припокриване и фиксирани ефекти по населено място; неопределеността остава по общински клъстери.',
                  'uncertainty': 'CR1 по общински клъстери; асимптотични нормални 95% интервали. За група с една община няма интервал.',
                  'multiplicity': 'BH за определимите първични H1-H4 тестове поотделно за националната и всяка целева извадка; H2 използва вътрешно Bonferroni за двете партии. Историческият модел е проучвателен. Всички тествани места в страната имат отделна обща BH корекция.',
                  'screening': 'Проучвателно правило |robust z|>=3 и |промяна на активността|>=10 пр.п.; промяна на списъка >5% е сигнал за проверка, а не статистическо отклонение. Това не са p стойности.',
                  'peers': 'Еднакви размер, град/село, официален метод, начална активност в интервал от 20 пр.п., промяна на списъка (<-5%, ±5%, >5%); поне 30 секции, първо в общината, после избирателния район, после страната.',
                  'spatial': spatial.get('method', ''), 'spatialFamily': spatial.get('family', ''),
                  'spatialSensitivity': 'Секциите с еднакви координати са едно място; връзки с нулево разстояние се изключват. Съвместно разположените секции не се тълкуват като независими места.',
                  'caution': 'Агрегираните резултати не установяват индивидуално прехвърляне, организатори, мотиви, натиск или нарушения.',
                  'limitations': ['Наблюдателни агрегирани данни; остават неизмерени местни фактори и административни промени.',
                                  'Националното групиране има 267 единици РИК + общински код на ЦИК; София е разделена в 23/24/25, така че това не са 265 административни общини.',
                                  'Публикацията за балотажа е предварителна дори при 100% обработка.',
                                  'Няма проверени общи граници на секции или социално-икономически контроли; близостта е приближение.',
                                  'Списъкът и проучвателните клъстери са насоки за проверка на протоколи, а не установени нарушения.']}}
    return clean_json(report), clean_json(domestic)


def compact_index(row):
    """The national list loads quickly; audit snapshots are fetched on selection."""
    omitted = {'elections', 'matches', 'roundMatch', 'history', 'signal', 'candidateChanges'}
    index = {key: value for key, value in row.items() if key not in omitted}
    index['roundMatch'] = {'status': row['roundMatch']['status']}
    index['elections'] = {}
    index['history'] = {date: {key: value for key, value in history.items() if key != 'parties'}
                        for date, history in row['history'].items()}
    index['signal'] = {key: value for key, value in row['signal'].items() if key != 'alternativeExplanations'}
    index['candidateChanges'] = row['candidateChanges']
    return index


def compact_detail(row):
    """Counts are lossless; absent registered ballots explicitly encode zero votes.

    Party names and source hashes live once in report.json. Shares can be exactly
    reconstructed from integer counts, avoiding several copies of every result.
    Original unmodified source rows remain available through table+line refs.
    """
    result = {'sectionId': row['sectionId'], 'matches': row['matches'], 'roundMatch': row['roundMatch'],
              'voteEncoding': 'sparse-zero-default', 'elections': {}}
    for date, election in row['elections'].items():
        if not election:
            result['elections'][date] = None
            continue
        snapshot = {key: election[key] for key in ['registered', 'added', 'electorateWithAdded', 'voted',
                                                  'turnout', 'turnoutWithAdded', 'sizeGroup', 'votingMethod',
                                                  'totalCandidateVotes', 'noSupport',
                                                  'invalidVotes', 'qualityFlags', 'sourceUrls']}
        evidence = election['methodEvidence']
        snapshot['methodEvidence'] = {key: evidence[key] for key in ['form', 'line', 'pointer', 'evidenceType',
                                                                    'retainedSourceUrl'] if key in evidence} if evidence else None
        snapshot['sourceDiscrepancies'] = election.get('sourceDiscrepancies', [])
        if election.get('reviewFlags'):
            snapshot['reviewFlags'] = election['reviewFlags']
        snapshot['settlementEkatteSource'] = election.get('settlementEkatteSource', 'not_recorded')
        snapshot['special'] = election.get('special', False)
        snapshot['specialReasons'] = election.get('specialReasons', [])
        snapshot['institutionReviewFlag'] = election.get('institutionReviewFlag', False)
        snapshot['sourceUrls'] = {key: value for key, value in election['sourceUrls'].items()
                                   if key in ('protocol', 'canonical')}
        snapshot['sourceRefs'] = {table: {'table': date + ':' + table, 'url': reference['url'], 'line': reference['line']}
                                  for table, reference in election['sourceRefs'].items()}
        snapshot['votesByParty'] = {ballot: {key: party[key] for key in ['total', 'paper', 'machine']}
                                    for ballot, party in election['votesByParty'].items()
                                    if party['total'] or party['paper'] or party['machine']}
        result['elections'][date] = snapshot
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--archive', action='append', default=[], metavar='DATE=PATH')
    parser.add_argument('--permutations', type=int, default=999)
    parser.add_argument('--seed', type=int, default=20261101)
    args = parser.parse_args()
    archives = {}
    for item in args.archive:
        date, path = item.split('=', 1)
        if date not in ANALYSIS_DATES or not Path(path).is_file():
            parser.error('Archive must be an existing DATE=PATH for one of the four analysis elections')
        archives[date] = Path(path)
    dataset = load_dataset(args.root, archives=archives)
    historical_benchmarks = build_historical_benchmarks(args.root)
    report, rows = build_report(dataset, args.permutations, args.seed, historical_benchmarks)
    output = args.output or args.root / 'public/data/forensics/2026'
    output.mkdir(parents=True, exist_ok=True)
    detail_directory = output / 'section-records'
    detail_directory.mkdir(exist_ok=True)
    indices = []
    detail_digest = hashlib.sha256()
    detail_bytes = 0
    for row in rows:
        content = (json.dumps(compact_detail(row), ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
        detail_path = detail_directory / (row['sectionId'] + '.json')
        detail_path.write_bytes(content)
        detail_digest.update(detail_path.name.encode('utf-8') + b'\0' + content)
        detail_bytes += len(content)
        index = compact_index(row)
        index['detailUrl'] = '/data/forensics/2026/section-records/' + detail_path.name
        indices.append(index)
    active_files = {row['sectionId'] + '.json' for row in rows}
    for old_path in detail_directory.glob('*.json'):
        if old_path.name not in active_files:
            old_path.unlink()
    for name, value in [('report', report), ('sections', indices)]:
        content = (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
        (output / f'{name}.json').write_bytes(content)
        (output / f'{name}.json.gz').write_bytes(gzip.compress(content, mtime=0))
    write_csv(output / 'sections.csv', list(section_csv_rows(rows)))
    for name in ['regions', 'municipalities', 'settlements', 'findings']:
        write_csv(output / f'{name}.csv', report[name])
    write_csv(output / 'added-elector-findings.csv', report['addedElectorFindings'])
    write_csv(output / 'candidate-findings.csv', report['candidateFindings'])
    for query in ['query1', 'query2']:
        for name in ['regions', 'municipalities', 'settlements']:
            write_csv(output / f'{query}-{name}.csv', report[query][name])
        write_csv(output / f'{query}-candidate-checks.csv', report[query]['candidateAnalysis']['hypotheses'])
        historical_rows = []
        for benchmark in report[query]['historicalRunoffs']:
            for finalist in benchmark['finalists']:
                historical_rows.append({key: value for key, value in benchmark.items()
                                        if key not in {'finalists', 'regions', 'stableListSensitivity'}} | finalist)
        write_csv(output / f'{query}-historical-runoffs.csv', historical_rows)
    for path in output.glob('*.csv'):
        path.with_suffix('.csv.gz').write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    manifest = {path.name: {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                for path in sorted(output.iterdir()) if path.is_file() and path.name != 'manifest.json'}
    manifest['section-records'] = {'files': len(rows), 'bytes': detail_bytes, 'sha256': detail_digest.hexdigest(),
                                    'hashMethod': 'SHA256 of sorted filename + NUL + file bytes for every active section.'}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'metadata': report['metadata'],
                      'hypotheses': [{key: row[key] for key in ['id', 'status', 'n', 'p', 'q']}
                                     for row in report['hypotheses']],
                      'reviewSections': len(report['findings']), 'clusters': len(report['clusters'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
