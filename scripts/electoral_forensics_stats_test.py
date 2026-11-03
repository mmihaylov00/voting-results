"""Regression and data-definition checks for the reproducible forensic reports."""

import copy
import unittest

import numpy as np

from analyze_electoral_forensics import (APRIL, FIRST_ROUND, OCTOBER_2024, SECOND_ROUND,
                                         compact_detail, enrich_rows, findings_for, group_rows, method_overlap, query_block,
                                         spatial_clusters)
from electoral_forensics_stats import (bh_adjust, collapse_sites, fixed_effect_model,
                                       matched_controls, spatial_test)


def election(date, voted, votes, no_support=0):
    total = sum(votes.values())
    return {'registered': 250, 'added': 2, 'voted': voted,
            'turnout': 100 * voted / 250, 'turnoutWithAdded': 100 * voted / 252,
            'sizeGroup': 'under300', 'votingMethod': 'paper', 'qualityFlags': [],
            'totalCandidateVotes': total, 'noSupport': no_support, 'invalidVotes': 0,
            'votesByParty': {key: {'id': key, 'name': 'candidate ' + key, 'total': value,
                                   'shareOfValidLists': 100 * value / total,
                                   'shareOfValidIncludingNoSupport': 100 * value / (total + no_support),
                                   'shareOfVoters': 100 * value / voted}
                             for key, value in votes.items()}}


def section(section_id='050100001', region='5'):
    return {'sectionId': section_id, 'regionId': region, 'regionName': 'Видин',
            'municipalityCode': '0501', 'municipalityName': 'Община',
            'settlementEkatte': '00001', 'settlementName': 'с. Пример', 'rural': True,
            'special': False, 'coordinates': {'longitude': 22.8, 'latitude': 43.9},
            'elections': {FIRST_ROUND: election(FIRST_ROUND, 90, {'4': 40, '25': 30, '1': 15}, 5),
                          SECOND_ROUND: election(SECOND_ROUND, 170, {'4': 90, '25': 75}, 5),
                          APRIL: election(APRIL, 100, {'15': 30, '17': 20, '11': 50}),
                          OCTOBER_2024: election(OCTOBER_2024, 100, {'18': 25, '8': 35, '13': 40})},
            'matches': {date: {'comparable': True} for date in [FIRST_ROUND, SECOND_ROUND, APRIL, OCTOBER_2024]},
            'roundMatch': {'status': 'matched'}, 'comparableRoundPair': True, 'exclusionReasons': []}


class ForensicsDefinitionsTest(unittest.TestCase):
    def test_registered_denominator_and_exact_registrations(self):
        row = enrich_rows([section()])[0]
        self.assertTrue(row['eligible'])
        self.assertEqual(row['turnout1'], 36)
        self.assertEqual(row['turnout2'], 68)
        self.assertEqual(row['deltaTurnoutPp'], 32)
        self.assertEqual(row['deltaVoted'], 80)
        self.assertAlmostEqual(row['deltaTurnoutSensitivityPp'], 100 * 80 / 252)
        self.assertEqual(row['history'][APRIL]['dpsShare'], 20)
        self.assertEqual(row['history'][OCTOBER_2024]['dpsShare'], 35)
        self.assertEqual(len(row['history'][APRIL]['parties']), 3)
        self.assertEqual(row['eliminatedCandidateVotes1'], 15)
        self.assertAlmostEqual(row['candidateChanges'][0]['share1'], 100 * 40 / 90)

    def test_focus_uses_registered_and_priority_not_voters(self):
        rows = [section(), section('010100001', '1')]
        rows[0]['elections'][FIRST_ROUND]['registered'] = 450
        first, other_region = enrich_rows(rows)
        self.assertFalse(first['small400'])
        self.assertTrue(other_region['small400'])
        self.assertFalse(other_region['priority'])

    def test_impossible_arithmetic_is_retained_but_excluded(self):
        row = section()
        row['elections'][SECOND_ROUND]['qualityFlags'] = ['valid_votes_exceed_voters']
        result = enrich_rows([row])[0]
        self.assertFalse(result['eligible'])
        self.assertEqual(result['deltaVoted'], 80)
        self.assertIn(SECOND_ROUND + ':valid_votes_exceed_voters', result['analysisExclusions'])

    def test_unverified_history_is_preserved_but_not_model_eligible(self):
        row = enrich_rows([section()], verified_dates={APRIL})[0]
        self.assertTrue(row['history'][APRIL]['eligibleForModel'])
        self.assertFalse(row['history'][OCTOBER_2024]['eligibleForModel'])
        self.assertEqual(len(row['history'][OCTOBER_2024]['parties']), 3)

    def test_sparse_detail_preserves_nonzero_counts_and_source_line(self):
        source = section()
        for date, record in source['elections'].items():
            record.update(electorateWithAdded=252, methodEvidence=None,
                          special=False, specialReasons=[], institutionReviewFlag=True,
                          sourceUrls={'canonical': '/table.txt', 'protocol': 'https://results.cik.bg/example'},
                          sourceRefs={'votes': {'line': 17, 'url': '/votes.txt'}})
            for party in record['votesByParty'].values():
                party.update(paper=party['total'], machine=0)
            record['votesByParty']['99'] = {'id': '99', 'name': 'Zero', 'total': 0, 'paper': 0, 'machine': 0,
                                            'shareOfValidLists': 0, 'shareOfValidIncludingNoSupport': 0,
                                            'shareOfVoters': 0}
        detail = compact_detail(enrich_rows([source])[0])
        self.assertEqual(detail['voteEncoding'], 'sparse-zero-default')
        self.assertNotIn('99', detail['elections'][FIRST_ROUND]['votesByParty'])
        self.assertEqual(detail['elections'][FIRST_ROUND]['votesByParty']['4']['total'], 40)
        self.assertEqual(detail['elections'][FIRST_ROUND]['sourceRefs']['votes']['line'], 17)
        self.assertFalse(detail['elections'][FIRST_ROUND]['special'])
        self.assertTrue(detail['elections'][FIRST_ROUND]['institutionReviewFlag'])

    def test_missing_runoff_does_not_become_zero_eliminated_vote_pool(self):
        row = section()
        row['elections'][SECOND_ROUND] = None
        self.assertIsNone(enrich_rows([row])[0]['eliminatedCandidateVotes1'])

    def test_group_turnout_uses_sum_of_each_registered_list(self):
        rows = enrich_rows([section(), section('050100002')])
        rows[1].update(registered1=500, registered2=600, voted1=100, voted2=150,
                       turnout1=20, turnout2=25, deltaTurnoutPp=5)
        group = group_rows(rows, 'regionId')[0]
        self.assertAlmostEqual(group['turnout1'], 100 * 190 / 750)
        self.assertAlmostEqual(group['turnout2'], 100 * 320 / 850)
        self.assertNotEqual(group['deltaTurnoutPp'], group['meanDeltaPp'])

    def test_different_settlements_are_not_within_place_method_overlap(self):
        rows = enrich_rows([section('050100001'), section('050100002')])
        rows[1].update(settlementEkatte='00002', method1='machine', method2='machine')
        stable, overlap = method_overlap(rows)
        self.assertEqual(len(stable), 2)
        self.assertEqual(overlap, [])
        rows[1]['settlementEkatte'] = rows[0]['settlementEkatte']
        self.assertEqual(len(method_overlap(rows)[1]), 2)


class StatisticalToolsTest(unittest.TestCase):
    def test_bh_known_values_and_missing(self):
        self.assertEqual(bh_adjust([.01, .04, .03, None]), [.03, .04, .04, None])

    def test_fixed_effects_recover_known_association_and_drop_collinearity(self):
        rng = np.random.default_rng(43)
        x = rng.normal(size=600)
        municipalities = np.repeat(np.arange(30), 20)
        effects = rng.normal(size=30)
        y = 2.5 * x + effects[municipalities] + rng.normal(scale=.2, size=600)
        model = fixed_effect_model(y, np.column_stack([x, 2 * x, np.ones(600)]),
                                   ['effect', 'duplicate', 'constant'], municipalities)
        self.assertAlmostEqual(model['coefficients']['effect']['estimate'], 2.5, delta=.04)
        self.assertEqual(model['dropped'], ['duplicate', 'constant'])
        self.assertLess(model['coefficients']['effect']['p'], .001)
        self.assertEqual(model['municipalities'], 30)

    def test_seeded_null_has_no_significant_known_zero_association(self):
        rng = np.random.default_rng(321)
        municipalities = np.repeat(np.arange(40), 30)
        x = rng.normal(size=1200)
        noise = rng.normal(size=1200)
        # Orthogonalize the synthetic error to x within groups for an exact null.
        centered = x.copy()
        for group in range(40):
            centered[municipalities == group] -= x[municipalities == group].mean()
        noise -= centered * (centered @ noise) / (centered @ centered)
        y = noise + municipalities / 10
        model = fixed_effect_model(y, x[:, None], ['null'], municipalities)
        self.assertAlmostEqual(model['coefficients']['null']['estimate'], 0, places=10)
        self.assertGreater(model['coefficients']['null']['p'], .99)

    def test_settlement_effects_are_separate_from_municipality_uncertainty(self):
        rng = np.random.default_rng(99)
        settlements = np.repeat(np.arange(72), 10)
        municipalities = settlements // 3
        local_effect = np.sin(settlements) * 10
        x = local_effect + rng.normal(size=720)
        y = local_effect * 4 + 2 * x + rng.normal(scale=.1, size=720)
        model = fixed_effect_model(y, x[:, None], ['effect'], municipalities, fixed_effects=settlements)
        self.assertAlmostEqual(model['coefficients']['effect']['estimate'], 2, delta=.03)
        self.assertEqual(model['fixedEffectGroups'], 72)
        self.assertEqual(model['municipalities'], 24)

    def test_spatial_collapses_colocated_and_permutation_is_deterministic(self):
        rows = enrich_rows([section(f'050100{i:03d}') for i in range(10)])
        for i, row in enumerate(rows):
            row['coordinates'] = {'longitude': 22.8 + (i // 2) * .005, 'latitude': 43.9}
        sites = collapse_sites(rows, list(range(10)))
        self.assertEqual(len(sites), 5)
        first = spatial_test(copy.deepcopy(sites), permutations=999, seed=37)
        second = spatial_test(copy.deepcopy(sites), permutations=999, seed=37)
        self.assertEqual(first, second)
        self.assertEqual(first['testedSites'], 5)
        for site in first['sites']:
            self.assertNotIn(site['id'], site['neighborIds'])
            self.assertEqual(len(site['sectionIds']), 2)

    def test_control_calipers_and_group_membership(self):
        target, good, bad = enrich_rows([section(), section('010100001', '1'), section('010100002', '1')])
        target['registeredChangePct'] = good['registeredChangePct'] = bad['registeredChangePct'] = 0
        bad['method1'] = 'machine'
        result = matched_controls([target], [good, bad])
        self.assertEqual(result['matchedN'], 1)
        self.assertEqual(result['pairs'][0]['controlIds'], [good['sectionId']])
        self.assertEqual(result['meanDifferencePp'], 0)

    def test_national_controls_exclude_self_and_same_electoral_district(self):
        target, same_district, other_district = enrich_rows([
            section(), section('050100002'), section('010100001', '1')])
        result = matched_controls([target], [target, same_district, other_district])
        self.assertEqual(result['pairs'][0]['controlIds'], [other_district['sectionId']])
        result = matched_controls([target, other_district], [target, same_district, other_district])
        regions = {row['sectionId']: row['regionId'] for row in [target, same_district, other_district]}
        for pair in result['pairs']:
            self.assertTrue(all(regions[sid] != regions[pair['sectionId']] for sid in pair['controlIds']))

    def test_nationwide_query_scope_keeps_nonpriority_sections_and_district_ids(self):
        rows = enrich_rows([section(), section('010100001', '1')])
        query = query_block('query1', 'National', rows, rows, [], [])
        self.assertEqual(query['summary']['eligibleSections'], 2)
        self.assertEqual([row['regionId'] for row in query['regions']], ['1', '5'])
        self.assertEqual(query['comparison']['matchedN'], 2)

    def test_national_finding_rank_has_no_former_priority_region_preference(self):
        rows = enrich_rows([section(), section('010100001', '1')])
        for row, z in zip(rows, [3, 5]):
            row['signal'].update(flags=['screen'], robustZ=z, peerN=30,
                                 peerMedian=row['deltaTurnoutPp'] - z * 1.4826, peerMad=1)
            for election_record in row['elections'].values():
                election_record['sourceUrls'] = {}
        findings = findings_for(rows)
        self.assertEqual(findings[0]['sectionId'], rows[1]['sectionId'])

    def test_cluster_components_use_undirected_neighbor_connectivity(self):
        rows = enrich_rows([section(f'050100{i:03d}') for i in range(3)])
        sites = []
        for i, row in enumerate(rows):
            sites.append({'id': str(i), 'sectionIds': [row['sectionId']], 'neighborIds': ['0', '2'] if i == 1 else [],
                          'neighborCount': 2 if i == 1 else 0, 'neighborResidualMean': 2,
                          'p': .001, 'q': .01, 'residual': 2, 'deltaTurnoutPp': 32,
                          'regionName': row['regionName'], 'municipalityName': row['municipalityName']})
        clusters = spatial_clusters({'sites': sites}, rows)
        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]['siteCount'], 3)


if __name__ == '__main__':
    unittest.main()
