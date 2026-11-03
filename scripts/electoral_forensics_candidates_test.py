"""Candidate-balance denominators, support guards and stable-list sensitivity."""

import copy
import json
import math
import random
import unittest

from electoral_forensics_candidates import APRIL, candidate_analysis
from electoral_forensics_stats import bh_adjust


def panel(count=140):
    rng = random.Random(751)
    rows = []
    for index in range(count):
        registered = rng.randint(400, 1000)
        changed = index < 20
        registered2 = round(registered * (1.1 if changed else rng.uniform(.98, 1.02)))
        voted1 = rng.randint(140, 190)
        delta_voted = rng.randint(80, 130)
        turnout1 = 100 * voted1 / registered
        turnout2 = 100 * (voted1 + delta_voted) / registered2
        delta_turnout = turnout2 - turnout1
        y1 = rng.randint(25, 70)
        gerb = rng.uniform(0, 60)
        dps = rng.uniform(0, 90 - gerb)
        y2 = round(2 * (y1 + .3 * delta_turnout + .02 * gerb - .03 * dps + rng.gauss(0, 3)))
        y2 = max(2, min(198, y2))
        rows.append({'sectionId': str(index).zfill(9), 'eligible': True,
                     'municipalityCode': str(index // 7).zfill(4), 'rural': bool(index % 2),
                     'registered1': registered, 'registered2': registered2,
                     'registeredChangePct': 100 * (registered2 - registered) / registered,
                     'turnout1': turnout1, 'deltaTurnoutPp': delta_turnout,
                     'deltaVoted': delta_voted, 'eliminatedCandidateVotes1': voted1 - 110,
                     'candidateChanges': [{'id': '25', 'name': 'Йотова', 'votes1': y1, 'votes2': y2},
                                          {'id': '4', 'name': 'Гюров', 'votes1': 100 - y1, 'votes2': 200 - y2}],
                     'history': {APRIL: {'matched': True, 'verified': True, 'eligibleForModel': True,
                                        'gerbShare': gerb, 'dpsShare': dps}}})
    return rows


class CandidateAnalysisTest(unittest.TestCase):
    def test_outcome_is_finalist_share_and_zero_denominators_are_excluded_from_models(self):
        rows = panel(3)
        rows[0]['candidateChanges'] = [{'id': '25', 'votes1': 20, 'votes2': 60},
                                       {'id': '4', 'votes1': 30, 'votes2': 40}]
        rows[1]['candidateChanges'][0]['votes1'] = 0
        rows[1]['candidateChanges'][1]['votes1'] = 0
        rows[2]['candidateChanges'][0]['votes2'] = 0
        rows[2]['candidateChanges'][1]['votes2'] = 0
        result = candidate_analysis(rows)
        self.assertEqual(result['summary']['usableSections'], 1)
        self.assertEqual(result['summary']['excludedZeroFinalistSections'], 2)
        self.assertEqual(result['summary']['meanFinalistShareChangePp'], 20)
        self.assertTrue(all(row['status'] == 'insufficient_support' for row in result['hypotheses']))

    def test_sparse_and_unverified_history_cannot_produce_historic_effects(self):
        rows = panel()
        for row in rows:
            row['history'][APRIL]['verified'] = False
        result = candidate_analysis(rows)
        self.assertEqual(result['hypotheses'][0]['status'], 'estimated')
        self.assertAlmostEqual(result['hypotheses'][0]['q'], min(1, 3 * result['hypotheses'][0]['p']))
        for hypothesis in result['hypotheses'][1:]:
            self.assertEqual(hypothesis['status'], 'insufficient_support')
            self.assertEqual(hypothesis['n'], 0)
            self.assertIsNone(hypothesis['estimate'])
            self.assertIsNone(hypothesis['q'])
        small = candidate_analysis(rows[:49])
        self.assertEqual(small['hypotheses'][0]['status'], 'insufficient_support')

    def test_supported_coefficients_intervals_and_three_term_bh_are_finite(self):
        result = candidate_analysis(panel())
        hypotheses = result['hypotheses']
        self.assertTrue(all(row['status'] == 'estimated' for row in hypotheses))
        for row in hypotheses:
            self.assertTrue(math.isfinite(row['estimate']))
            self.assertEqual(len(row['ci95']), 2)
            self.assertTrue(all(math.isfinite(value) for value in row['ci95']))
            self.assertLessEqual(row['ci95'][0], row['estimate'])
            self.assertGreaterEqual(row['ci95'][1], row['estimate'])
            self.assertTrue(0 <= row['p'] <= row['q'] <= 1)
        self.assertEqual([row['q'] for row in hypotheses], bh_adjust([row['p'] for row in hypotheses]))
        self.assertIn('10 пр.п.', hypotheses[0]['unit'])
        json.dumps(result, allow_nan=False)

    def test_stable_lists_and_candidate_summary_use_explicit_consistent_samples(self):
        rows = panel()
        rows[0]['eligible'] = False
        rows[1]['candidateChanges'] = rows[1]['candidateChanges'][:1]
        before = copy.deepcopy(rows)
        result = candidate_analysis(rows)
        summary = result['summary']
        stable = [row for row in rows if row['eligible'] and abs(row['registeredChangePct']) <= 5]
        self.assertEqual(summary['eligibleSections'], 139)
        self.assertEqual(summary['pairedCandidateSections'], 138)
        self.assertEqual(summary['excludedMissingCandidateSections'], 1)
        self.assertEqual(summary['stableListSections'], len(stable))
        self.assertEqual(summary['stableList']['usableSections'], len(stable))
        self.assertEqual(result['hypotheses'][0]['details']['sensitivity']['n'], len(stable))
        self.assertEqual(summary['stableList']['deltaVoted'], sum(row['deltaVoted'] for row in stable))
        for candidate in summary['stableList']['candidates']:
            expected = sum(next(value for value in row['candidateChanges'] if value['id'] == candidate['id'])['votes2']
                           for row in stable)
            self.assertEqual(candidate['votes2'], expected)
        self.assertEqual(rows, before)

    def test_constant_turnout_change_and_dependent_party_predictors_are_not_identifiable(self):
        rows = panel()
        for row in rows:
            row['deltaTurnoutPp'] = 10
            row['history'][APRIL]['dpsShare'] = 100 - row['history'][APRIL]['gerbShare']
        result = candidate_analysis(rows)
        self.assertEqual(result['hypotheses'][0]['status'], 'insufficient_support')
        for hypothesis in result['hypotheses'][1:]:
            self.assertEqual(hypothesis['status'], 'not_identifiable')
            self.assertIsNone(hypothesis['estimate'])
            self.assertIsNone(hypothesis['p'])

    def test_effect_needs_variation_in_ten_municipality_groups(self):
        rows = panel()
        for row in rows:
            if row['municipalityCode'] != '0000':
                row['history'][APRIL]['gerbShare'] = 25
        result = candidate_analysis(rows)
        gerb = result['hypotheses'][1]
        self.assertEqual(gerb['status'], 'insufficient_support')
        self.assertEqual(gerb['details']['support']['varyingMunicipalityGroups'], 1)
        self.assertIsNone(gerb['estimate'])
        self.assertIsNone(gerb['q'])

    def test_missing_controls_stay_excluded_and_screen_dominance_is_descriptive(self):
        rows = panel(4)
        for row in rows:
            row.update(deltaTurnoutPp=10, deltaVoted=30)
        rows[0]['candidateChanges'] = [{'id': '25', 'votes1': 10, 'votes2': 40},
                                       {'id': '4', 'votes1': 10, 'votes2': 20}]
        rows[1]['candidateChanges'] = [{'id': '25', 'votes1': 10, 'votes2': 20},
                                       {'id': '4', 'votes1': 10, 'votes2': 40}]
        rows[2]['candidateChanges'] = [{'id': '25', 'votes1': 10, 'votes2': 20},
                                       {'id': '4', 'votes1': 10, 'votes2': 20}]
        rows[3]['deltaVoted'] = 29
        rows[3]['rural'] = None
        result = candidate_analysis(rows)
        self.assertEqual(result['summary']['excludedMissingControlsSections'], 1)
        self.assertEqual(result['summary']['screen']['sections'], 3)
        self.assertEqual(result['summary']['screen']['yotovaDominantSections'], 1)
        self.assertEqual(result['summary']['screen']['gyurovDominantSections'], 1)
        self.assertEqual(result['summary']['screen']['tiedSections'], 1)

    def test_float_roundoff_does_not_change_inclusive_screens_after_json_rounding(self):
        row = panel(1)[0]
        row.update(deltaTurnoutPp=9.999999999999996, deltaVoted=30,
                   registeredChangePct=5.000000000000001)
        original = candidate_analysis([row])
        rounded = copy.deepcopy(row)
        rounded.update(deltaTurnoutPp=10, registeredChangePct=5)
        replay = candidate_analysis([rounded])
        self.assertEqual(original['summary']['screen'], replay['summary']['screen'])
        self.assertEqual(original['summary']['stableListSections'], 1)

    def test_empty_or_invalid_counts_return_finite_unsupported_results(self):
        row = panel(1)[0]
        row['candidateChanges'][0]['votes1'] = float('nan')
        result = candidate_analysis([row])
        self.assertEqual(result['summary']['pairedCandidateSections'], 0)
        self.assertTrue(all(check['estimate'] is None for check in result['hypotheses']))
        json.dumps(result, allow_nan=False)
        json.dumps(candidate_analysis([]), allow_nan=False)


if __name__ == '__main__':
    unittest.main()
