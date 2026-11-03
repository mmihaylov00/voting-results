"""Exploratory changes in the balance between the two presidential finalists.

The input is an already identity-checked, enriched domestic section panel. This
module never interprets candidate gains as individual voter transitions.
"""

from collections import defaultdict
import math

from electoral_forensics_stats import bh_adjust, fixed_effect_model, mean_interval


APRIL = '2026.04.19'
MIN_SECTIONS = 50
MIN_MUNICIPALITIES = 10
THRESHOLD_TOLERANCE = 1e-9
CANDIDATES = [('25', 'Илияна Йотова'), ('4', 'Андрей Гюров')]
CONTROL_NAMES = ['baselineFinalistShare', 'logRegistered', 'logRegisteredSquared',
                 'baselineTurnout', 'registeredChangePct', 'rural', 'eliminatedPoolPer100R1']
TURNOUT_TERM = 'turnoutChangePer10pp'
HISTORY_TERMS = ['gerb2026Per10pp', 'dps2026Per10pp']
CHECKS = [
    ('C1', 'Промяна между финалистите и активност', TURNOUT_TERM, 'промяна в активността'),
    ('C2', 'Априлски дял на ГЕРБ-СДС и промяна между финалистите', HISTORY_TERMS[0], 'априлски дял на ГЕРБ-СДС'),
    ('C3', 'Априлски дял на ДПС и промяна между финалистите', HISTORY_TERMS[1], 'априлски дял на ДПС'),
]


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def _pair(row):
    changes = {str(value.get('id')): value for value in row.get('candidateChanges', [])}
    if not all(ballot in changes for ballot, _ in CANDIDATES):
        return None
    counts = [[_number(changes[ballot].get('votes' + suffix)) for suffix in ('1', '2')]
              for ballot, _ in CANDIDATES]
    if any(value is None or value < 0 or not value.is_integer() for pair in counts for value in pair):
        return None
    return {'row': row, 'y1': int(counts[0][0]), 'y2': int(counts[0][1]),
            'g1': int(counts[1][0]), 'g2': int(counts[1][1])}


def _observation(pair):
    row = pair['row']
    denominator1, denominator2 = pair['y1'] + pair['g1'], pair['y2'] + pair['g2']
    if not denominator1 or not denominator2:
        return None
    values = [_number(row.get(key)) for key in ['registered1', 'turnout1', 'deltaTurnoutPp',
                                                'registeredChangePct', 'eliminatedCandidateVotes1']]
    if any(value is None for value in values) or values[0] <= 0 or values[4] < 0 \
            or not isinstance(row.get('rural'), bool) or not row.get('municipalityCode'):
        return None
    registered, turnout, delta, list_change, eliminated = values
    baseline_share = 100 * pair['y1'] / denominator1
    log_size = math.log(registered)
    return {'pair': pair, 'outcome': 100 * pair['y2'] / denominator2 - baseline_share,
            'controls': [baseline_share, log_size, log_size ** 2, turnout, list_change,
                         float(row['rural']), 100 * eliminated / registered],
            TURNOUT_TERM: delta / 10, 'municipality': row['municipalityCode']}


def _history(observation):
    history = observation['pair']['row'].get('history', {}).get(APRIL, {})
    if not all(history.get(key) for key in ['matched', 'verified', 'eligibleForModel']):
        return None
    shares = [_number(history.get(key)) for key in ['gerbShare', 'dpsShare']]
    return [share / 10 for share in shares] if all(share is not None and 0 <= share <= 100 for share in shares) else None


def _within_support(observations, values):
    grouped = defaultdict(list)
    for observation, value in zip(observations, values):
        grouped[observation['municipality']].append(value)
    varying = [group for group in grouped.values() if max(group) - min(group) > 1e-8]
    return {'n': len(observations), 'municipalityGroups': len(grouped),
            'varyingMunicipalityGroups': len(varying), 'varyingSections': sum(map(len, varying))}


def _fit(observations, historical=False):
    selected = [observation for observation in observations if not historical or _history(observation) is not None]
    names = CONTROL_NAMES + [TURNOUT_TERM] + (HISTORY_TERMS if historical else [])
    features = [observation['controls'] + [observation[TURNOUT_TERM]] + (_history(observation) if historical else [])
                for observation in selected]
    groups = {observation['municipality'] for observation in selected}
    if len(selected) < MIN_SECTIONS or len(groups) < MIN_MUNICIPALITIES:
        return {'n': len(selected), 'municipalities': len(groups), 'status': 'insufficient_support',
                'coefficients': {}, 'dropped': [], 'method': '', 'limitations': []}, selected, features, names
    model = fixed_effect_model([observation['outcome'] for observation in selected], features, names,
                               [observation['municipality'] for observation in selected])
    model.pop('residuals', None)
    return model, selected, features, names


def _hypothesis(check, fitted):
    identifier, title, term, exposure = check
    model, observations, features, names = fitted
    values = [row[names.index(term)] for row in features]
    support = _within_support(observations, values)
    coefficient = model.get('coefficients', {}).get(term)
    status, reason = 'estimated', ''
    if support['n'] < MIN_SECTIONS or support['municipalityGroups'] < MIN_MUNICIPALITIES:
        status, reason = 'insufficient_support', 'Нужни са поне 50 съпоставими секции и 10 общински групи по ЦИК.'
    elif support['varyingMunicipalityGroups'] < MIN_MUNICIPALITIES or support['varyingSections'] < MIN_SECTIONS:
        status, reason = 'insufficient_support', 'Недостатъчна промяна на показателя вътре в поне 10 общински групи по ЦИК.'
    elif not coefficient or term in model.get('dropped', []) or any(
            name in model.get('dropped', []) for name in HISTORY_TERMS if term in HISTORY_TERMS):
        status, reason = 'not_identifiable', 'Показателят не може да се отдели от останалите променливи в тази извадка.'
    elif model.get('conditionNumber', math.inf) > 1e8 or not all(
            _number(value) is not None for value in [coefficient.get('estimate'), coefficient.get('p')]
            + list(coefficient.get('ci95') or [])) or len(coefficient.get('ci95') or []) != 2:
        status, reason = 'not_identifiable', 'Недостатъчна числена или остатъчна вариация за надежден интервал.'
    estimate = coefficient if status == 'estimated' else {}
    return {'id': identifier, 'title': title, 'status': status,
            'summary': reason or 'Проучвателна асоциация в промяната на дела сред двамата финалисти; '
                                'резултатът за Гюров е точно противоположен поради общия знаменател.',
            'n': model['n'], 'estimate': estimate.get('estimate'), 'ci95': estimate.get('ci95'),
            'p': estimate.get('p'), 'q': None,
            'unit': f'пр.п. промяна в дела на Йотова сред финалистите за 10 пр.п. {exposure}',
            'method': model.get('method') or 'Минимална извадка и проверка за вариация вътре в общинските групи.',
            'limitations': list(model.get('limitations', [])) + [
                'Промяната между двамата финалисти е един общ баланс; двата знака не са независими резултати.',
                'Наблюдателната асоциация не установява индивидуално прехвърляне, организатор или нарушение.'],
            'details': {'predictor': term, 'support': support, 'controls': names,
                        'rank': model.get('rank'), 'dropped': model.get('dropped', []),
                        'conditionNumber': model.get('conditionNumber')}}


def _analyses(observations):
    main = _fit(observations)
    historic = _fit(observations, historical=True)
    result = [_hypothesis(check, main if check[0] == 'C1' else historic) for check in CHECKS]
    # Keep the declared three-term family conservative when a term is unsupported.
    for row, adjusted in zip(result, bh_adjust([row['p'] if row['p'] is not None else 1 for row in result])):
        row['q'] = adjusted if row['p'] is not None else None
    return result


def _summary(eligible, pairs, observations):
    zero_denominators = sum(pair['y1'] + pair['g1'] == 0 or pair['y2'] + pair['g2'] == 0 for pair in pairs)
    screen = [pair for pair in pairs if _number(pair['row'].get('deltaTurnoutPp')) is not None
              and _number(pair['row'].get('deltaVoted')) is not None
              and pair['row']['deltaTurnoutPp'] >= 10 - THRESHOLD_TOLERANCE and pair['row']['deltaVoted'] >= 30]
    candidates = []
    for ballot, default_name in CANDIDATES:
        prefix = 'y' if ballot == '25' else 'g'
        first = sum(pair[prefix + '1'] for pair in pairs)
        second = sum(pair[prefix + '2'] for pair in pairs)
        denominator1 = sum(pair['y1'] + pair['g1'] for pair in pairs)
        denominator2 = sum(pair['y2'] + pair['g2'] for pair in pairs)
        share1 = 100 * first / denominator1 if denominator1 else None
        share2 = 100 * second / denominator2 if denominator2 else None
        name = next((change.get('name', default_name) for pair in pairs
                     for change in pair['row']['candidateChanges'] if str(change.get('id')) == ballot), default_name)
        candidates.append({'id': ballot, 'name': name, 'votes1': first, 'votes2': second,
                           'deltaVotes': second - first, 'finalistShare1': share1, 'finalistShare2': share2,
                           'deltaFinalistSharePp': share2 - share1 if share1 is not None and share2 is not None else None})
    delta_values = [_number(pair['row'].get('deltaVoted')) for pair in pairs]
    interval = mean_interval([observation['outcome'] for observation in observations],
                             [observation['municipality'] for observation in observations])
    return {'eligibleSections': len(eligible), 'pairedCandidateSections': len(pairs), 'usableSections': len(observations),
            'excludedMissingCandidateSections': len(eligible) - len(pairs),
            'excludedZeroFinalistSections': zero_denominators,
            'excludedMissingControlsSections': len(pairs) - len(observations) - zero_denominators,
            'candidates': candidates, 'deltaVoted': sum(delta_values) if all(value is not None for value in delta_values) else None,
            'meanFinalistShareChangePp': interval['mean'], 'meanFinalistShareChangeCi95': interval['ci95'],
            'screen': {'definition': 'Описателен проучвателен праг: промяна в активността >=10 пр.п. и гласували +30 или повече; не е предварителна регистрация.',
                       'sections': len(screen), 'yotovaGain': sum(pair['y2'] - pair['y1'] for pair in screen),
                       'gyurovGain': sum(pair['g2'] - pair['g1'] for pair in screen),
                       'deltaVoted': sum(pair['row']['deltaVoted'] for pair in screen),
                       'yotovaDominantSections': sum(pair['y2'] - pair['y1'] > pair['g2'] - pair['g1'] for pair in screen),
                       'gyurovDominantSections': sum(pair['g2'] - pair['g1'] > pair['y2'] - pair['y1'] for pair in screen),
                       'tiedSections': sum(pair['y2'] - pair['y1'] == pair['g2'] - pair['g1'] for pair in screen)}}


def _finite(value):
    if isinstance(value, dict):
        return {key: _finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(item) for item in value]
    return value if not isinstance(value, float) or math.isfinite(value) else None


def candidate_analysis(rows):
    """Return one query's candidate balance checks without mutating the panel."""
    eligible = [row for row in rows if row.get('eligible')]
    pairs = [pair for row in eligible if (pair := _pair(row)) is not None]
    observations = [observation for pair in pairs if (observation := _observation(pair)) is not None]
    stable = [row for row in eligible if _number(row.get('registeredChangePct')) is not None
              and abs(row['registeredChangePct']) <= 5 + THRESHOLD_TOLERANCE]
    stable_pairs = [pair for pair in pairs if _number(pair['row'].get('registeredChangePct')) is not None
                    and abs(pair['row']['registeredChangePct']) <= 5 + THRESHOLD_TOLERANCE]
    stable_observations = [observation for observation in observations
                           if abs(observation['pair']['row']['registeredChangePct']) <= 5 + THRESHOLD_TOLERANCE]
    summary = _summary(eligible, pairs, observations)
    summary['stableListSections'] = len(stable)
    summary['stableList'] = _summary(stable, stable_pairs, stable_observations)
    hypotheses, sensitivity = _analyses(observations), _analyses(stable_observations)
    for main, stable_check in zip(hypotheses, sensitivity):
        main['details']['sensitivity'] = {key: stable_check[key] for key in
                                         ['status', 'n', 'estimate', 'ci95', 'p', 'q', 'unit', 'summary']}
    return _finite({'summary': summary, 'hypotheses': hypotheses, 'methodology': {
        'outcome': '100 * Йотова / (Йотова + Гюров), балотаж минус първи тур; делът на Гюров се изменя с точно противоположния знак. НПН и отпадналите кандидати не влизат в този знаменател.',
        'sample': 'Само секции с eligible=true и двата кандидатски записа; нулев знаменател за финалистите в който и да е тур или липсващи контроли изключват секцията от моделите. Абсолютните сборове пазят всички валидни кандидатски записи.',
        'controls': 'Начален дял сред финалистите, логаритъм на totalA и квадрат, начална активност, промяна на списъка, град/село, отпаднали кандидатски гласове на 100 избиратели по totalA на първия тур; фиксирани общински ефекти и CR1 по общински групи на ЦИК.',
        'history': 'ГЕРБ-СДС (15) и Движение за права и свободи - ДПС (17), 19.04.2026, поотделно за 10 пр.п. дял от действителните гласове за листи. Двата показателя се оценяват заедно само в проверен, съпоставим и аритметично валиден исторически поднабор.',
        'support': 'Поне 50 секции и 10 общински групи, включително вариация на проверявания показател в поне 10 групи; зависим или отпаднал показател не получава оценка.',
        'multiplicity': 'Три проучвателни коефициента C1-C3 образуват едно BH семейство за всяка заявка. Стабилните списъци (абсолютна промяна <=5%) са чувствителност с отделна BH корекция. Заявка 2 е вложена извадка и не е независимо потвърждение.',
        'screen': summary['screen']['definition'],
        'limitations': ['Кандидатският прираст не е статистическа аномалия сам по себе си и не показва за кого са гласували отделни хора.',
                        'Тези асоциации не установяват причинен ефект, организатор или нарушение; балотажната публикация остава предварителна.',
                        'Използвани са общинските кодови групи на ЦИК, включително отделните групи на София в райони 23/24/25.']}})
