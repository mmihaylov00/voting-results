"""Small, deterministic statistical tools used by the published election reports.

NumPy is the only non-standard dependency. In this workspace it is available in
the existing Codex Python runtime; nothing is installed into the site project.
"""

from collections import defaultdict
import math

import numpy as np


def bh_adjust(values):
    """Benjamini-Hochberg adjusted p values, preserving missing entries."""
    result = [None] * len(values)
    ordered = sorted((float(p), i) for i, p in enumerate(values) if p is not None)
    previous = 1.0
    for rank in range(len(ordered), 0, -1):
        p, index = ordered[rank - 1]
        previous = min(previous, p * len(ordered) / rank)
        result[index] = min(1.0, previous)
    return result


def mean_interval(values, clusters):
    """Unweighted section mean and municipality-cluster normal 95% interval."""
    if not values:
        return {'mean': None, 'ci95': None, 'clusters': 0}
    values = np.asarray(values, dtype=float)
    mean = float(values.mean())
    sums = defaultdict(float)
    for value, cluster in zip(values, clusters):
        sums[cluster] += float(value - mean)
    count = len(sums)
    if count < 2:
        return {'mean': mean, 'ci95': None, 'clusters': count}
    variance = count / (count - 1) * sum(value ** 2 for value in sums.values()) / len(values) ** 2
    margin = 1.96 * math.sqrt(max(0, variance))
    return {'mean': mean, 'ci95': [mean - margin, mean + margin], 'clusters': count}


def fixed_effect_model(y, features, names, clusters, fixed_effects=None):
    """Within-group OLS with a municipality-cluster sandwich covariance.

    Zero or dependent columns are removed in declared order, and exposed in the
    result. They are never interpreted as identifiable zero effects.
    """
    y = np.asarray(y, dtype=float)
    x = np.asarray(features, dtype=float)
    if x.ndim != 2 or len(y) != len(x) or x.shape[1] != len(names):
        raise ValueError('Inconsistent regression dimensions')
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError('Regression input must be finite')
    groups = defaultdict(list)
    for index, cluster in enumerate(clusters):
        groups[cluster].append(index)
    if fixed_effects is not None and len(fixed_effects) != len(y):
        raise ValueError('Fixed-effect groups must align with regression rows')
    effects = defaultdict(list)
    for index, group in enumerate(fixed_effects if fixed_effects is not None else clusters):
        effects[group].append(index)
    centered_y = y.copy()
    centered_x = x.copy()
    for indices in effects.values():
        centered_y[indices] -= y[indices].mean()
        centered_x[indices] -= x[indices].mean(axis=0)
    scale = np.sqrt(np.mean(centered_x ** 2, axis=0))
    scaled = centered_x / np.where(scale > 1e-10, scale, 1)
    keep = []
    for index in range(len(names)):
        proposed = keep + [index]
        if scale[index] > 1e-10 and np.linalg.matrix_rank(scaled[:, proposed], tol=1e-9) > len(keep):
            keep.append(index)
    effect_label = 'населени места' if fixed_effects is not None else 'общини'
    result = {'n': len(y), 'municipalities': len(groups), 'fixedEffectGroups': len(effects), 'rank': len(keep),
              'dropped': [name for i, name in enumerate(names) if i not in keep],
              'coefficients': {}, 'method': f'Линейна регресия с фиксирани ефекти за {effect_label}; '
              'CR1 ковариация по общински клъстери; асимптотични нормални 95% интервали и двустранни p стойности.',
              'limitations': ['Коефициентите показват асоциации; секциите не са разпределени случайно.',
                              'Нормалните интервали може да са неточни при малко общини.']}
    if not keep or len(y) <= len(keep) + len(effects) or len(groups) < 2:
        result['status'] = 'insufficient_support'
        result['residuals'] = centered_y.tolist()
        return result
    design = scaled[:, keep]
    beta = np.linalg.lstsq(design, centered_y, rcond=None)[0]
    residuals = centered_y - design @ beta
    bread = np.linalg.pinv(design.T @ design)
    meat = np.zeros((len(keep), len(keep)))
    for indices in groups.values():
        score = design[indices].T @ residuals[indices]
        meat += np.outer(score, score)
    degrees = len(y) - len(keep) - len(effects)
    correction = len(groups) / (len(groups) - 1) * (len(y) - 1) / degrees
    covariance = correction * bread @ meat @ bread
    for offset, index in enumerate(keep):
        estimate = float(beta[offset] / scale[index])
        standard_error = math.sqrt(max(0, float(covariance[offset, offset]))) / scale[index]
        z = estimate / standard_error if standard_error > 1e-12 else None
        result['coefficients'][names[index]] = {
            'estimate': estimate, 'se': standard_error,
            'ci95': [estimate - 1.96 * standard_error, estimate + 1.96 * standard_error],
            'p': math.erfc(abs(z) / math.sqrt(2)) if z is not None else None,
        }
    result.update(status='estimated', conditionNumber=float(np.linalg.cond(design)),
                  residuals=residuals.tolist())
    if len(groups) < 30:
        result['limitations'].append('Под 30 общински клъстера; интервалите са приблизителни.')
    return result


def matched_controls(targets, controls, max_controls=5):
    """Other-region controls matched on pre-declared observable section features.

    Exact strata: rural status, registered size bin and R1 voting method. Calipers:
    10 pp baseline turnout, 30% electorate size, 5 pp electorate-list change.
    Controls may be reused, which is disclosed instead of claiming independence.
    """
    strata = defaultdict(list)
    for row in controls:
        strata[(row['rural'], row['sizeGroup'], row['method1'])].append(row)
    pairs = []
    for row in targets:
        candidates = []
        for other in strata[(row['rural'], row['sizeGroup'], row['method1'])]:
            baseline = abs(row['turnout1'] - other['turnout1'])
            size = abs(math.log(row['registered1'] / other['registered1']))
            list_change = abs(row['registeredChangePct'] - other['registeredChangePct'])
            if baseline <= 10 and size <= math.log(1.3) and list_change <= 5:
                distance = baseline / 10 + size / math.log(1.3) + list_change / 5
                candidates.append((distance, other['sectionId'], other))
        selected = sorted(candidates, key=lambda item: (item[0], item[1]))[:max_controls]
        if selected:
            control_mean = sum(item[2]['deltaTurnoutPp'] for item in selected) / len(selected)
            pairs.append({'sectionId': row['sectionId'], 'controlIds': [item[1] for item in selected],
                          'deltaTurnoutPp': row['deltaTurnoutPp'], 'controlMeanDeltaPp': control_mean,
                          'differencePp': row['deltaTurnoutPp'] - control_mean,
                          'municipalityCode': row['municipalityCode']})
    interval = mean_interval([pair['differencePp'] for pair in pairs],
                             [pair['municipalityCode'] for pair in pairs])
    return {'targetN': len(targets), 'matchedN': len(pairs),
            'uniqueControlN': len({sid for pair in pairs for sid in pair['controlIds']}),
            'meanDifferencePp': interval['mean'], 'ci95': interval['ci95'],
            'municipalities': interval['clusters'], 'pairs': pairs,
            'method': 'До пет най-близки контроли от други области; еднакви град/село, размер и метод; '
                      'начална активност ±10 пр.п., отношение на списъците до 1.3, промяна на списъка ±5 пр.п. '
                      'Нормален интервал по общински клъстери.',
            'limitations': ['Една контролна секция може да участва повече от веднъж; съпоставянето е наблюдателно.',
                            'Интервалът групира целевите общини, но не цялата зависимост от повторно използвани контроли.',
                            'Неизмерени местни различия остават възможни.']}


def collapse_sites(rows, residuals):
    """One observation per coordinate within municipality; co-located sections collapse."""
    groups = defaultdict(list)
    for row, residual in zip(rows, residuals):
        point = row.get('coordinates')
        if point and row['rural'] is not None:
            key = (row['municipalityCode'], round(point['longitude'], 5), round(point['latitude'], 5))
            groups[key].append((row, residual))
    sites = []
    for key, members in sorted(groups.items()):
        first = members[0][0]
        bins = {row['sizeGroup'] for row, _ in members}
        sites.append({'id': '|'.join(map(str, key)), 'municipalityCode': key[0],
                      'longitude': key[1], 'latitude': key[2],
                      'regionName': first['regionName'], 'municipalityName': first['municipalityName'],
                      'rural': first['rural'], 'sizeGroup': next(iter(bins)) if len(bins) == 1 else 'mixed',
                      'sectionIds': [row['sectionId'] for row, _ in members],
                      'residual': float(np.mean([value for _, value in members])),
                      'deltaTurnoutPp': float(np.mean([row['deltaTurnoutPp'] for row, _ in members]))})
    return sites


def spatial_test(sites, permutations=999, seed=20261101):
    """Conditional local spatial concordance test at distinct coordinate sites.

    Up to five nearest sites within 10 km and the same municipality. Residuals
    permute within municipality x rural x size strata containing at least 5 sites.
    Co-located sections are already collapsed. Tests are two-sided for concordance;
    all tested locations form one BH family, including non-priority regions.
    """
    if permutations < 999:
        raise ValueError('At least 999 spatial permutations are required')
    count = len(sites)
    if not count:
        return {'sites': [], 'globalP': None, 'testedSites': 0, 'permutations': permutations}
    by_municipality = defaultdict(list)
    strata = defaultdict(list)
    for i, site in enumerate(sites):
        by_municipality[site['municipalityCode']].append(i)
        strata[(site['municipalityCode'], site['rural'], site['sizeGroup'])].append(i)
    neighbors = np.full((count, 5), -1, dtype=int)
    for indices in by_municipality.values():
        if len(indices) < 4:
            continue
        lat = np.array([sites[i]['latitude'] for i in indices])
        lon = np.array([sites[i]['longitude'] for i in indices])
        for offset, index in enumerate(indices):
            distances = np.sqrt(((lat - lat[offset]) * 111.2) ** 2 +
                                ((lon - lon[offset]) * 111.2 * math.cos(math.radians(lat[offset]))) ** 2)
            usable = np.flatnonzero((distances > 0.001) & (distances <= 10))
            closest = sorted(usable, key=lambda j: (distances[j], indices[j]))[:5]
            neighbors[index, :len(closest)] = [indices[j] for j in closest]
    valid = neighbors >= 0
    degree = valid.sum(axis=1)
    movable = np.zeros(count, dtype=bool)
    exchangeable = []
    for indices in strata.values():
        if len(indices) >= 5:
            exchangeable.append(np.asarray(indices, dtype=int))
            movable[indices] = True
    tested = (degree >= 3) & movable
    residuals = np.asarray([site['residual'] for site in sites])
    scale = float(np.std(residuals))
    if scale < 1e-10:
        tested[:] = False
    z = residuals / (scale if scale > 1e-10 else 1)
    safe = np.maximum(neighbors, 0)

    def statistic(values):
        average = np.sum(values[safe] * valid, axis=1) / np.maximum(degree, 1)
        return np.maximum(0, values * average), average

    observed, neighbor_mean = statistic(z)
    exceed = np.zeros(count, dtype=int)
    global_statistic = float(np.mean(observed[tested])) if tested.any() else None
    global_exceed = 0
    rng = np.random.default_rng(seed)
    for _ in range(permutations):
        permuted = z.copy()
        for indices in exchangeable:
            permuted[indices] = rng.permutation(z[indices])
        simulated, _ = statistic(permuted)
        exceed += simulated >= observed - 1e-12
        if global_statistic is not None and float(np.mean(simulated[tested])) >= global_statistic - 1e-12:
            global_exceed += 1
    p_values = [(int(exceed[i]) + 1) / (permutations + 1) if tested[i] else None for i in range(count)]
    q_values = bh_adjust(p_values)
    for i, site in enumerate(sites):
        site.update(neighborIds=[sites[j]['id'] for j in neighbors[i] if j >= 0],
                    neighborCount=int(degree[i]), neighborResidualMean=float(neighbor_mean[i] * scale),
                    localStatistic=float(observed[i]), p=p_values[i], q=q_values[i])
    return {'sites': sites, 'testedSites': int(tested.sum()),
            'globalStatistic': global_statistic,
            'globalP': (global_exceed + 1) / (permutations + 1) if global_statistic is not None else None,
            'permutations': permutations, 'seed': seed, 'minimumPermutationP': 1 / (permutations + 1),
            'collapsedSectionCount': sum(len(site['sectionIds']) - 1 for site in sites),
            'method': 'Различни координати, закръглени до 5 знака; до пет най-близки места в радиус 10 км '
                      'в същата община; поне три съседни места; 999+ условни пермутации по община, град/село '
                      'и размер в групи с поне пет места. Положителното произведение на остатъци тества '
                      'сходни високи или сходни ниски промени.',
            'family': 'Всички тествани места в страната, корекция Benjamini-Hochberg FDR.',
            'limitations': ['Географската близост не е проверена граница между съседни секции.',
                            'Координатите може да са центрове на населени места; местоположенията са приблизителни.',
                            'Разменяемостта на остатъците в групите е допускане.',
                            'Места с няколко размера секции имат отделна пермутационна група.',
                            'Крайният брой пермутации ограничава най-малката p стойност; липса на FDR сигнал не доказва липса на модел.']}
