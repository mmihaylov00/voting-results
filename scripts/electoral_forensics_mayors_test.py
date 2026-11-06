"""Geographic joins and denominator checks for the mayor comparison."""

import copy
import unittest

from electoral_forensics_mayors import administrative_municipalities, mayor_analysis


def section(code='0101', region='1', ekatte='00001', eligible=True, spike=True):
    return {'municipalityCode': code, 'regionId': region, 'settlementEkatte': ekatte,
            'municipalityName': 'Община', 'eligible': eligible,
            'registered1': 100, 'registered2': 200, 'voted1': 20, 'voted2': 80,
            'deltaTurnoutPp': 20, 'candidateReviewFlags': ['screen'] if spike else [],
            'candidateChanges': [{'id': '4', 'deltaVotes': 25}, {'id': '25', 'deltaVotes': 35}]}


def snapshot():
    return {'metadata': {'basis': '2023 nomination', 'sourceUrl': 'https://results.cik.bg/',
                         'electionDate': '2023', 'limitations': []},
            'municipalities': [{'administrativeCode': code, 'name': code, 'mayor': 'Кмет',
                                'party': party, 'sourceUrl': 'https://results.cik.bg/'}
                               for code, party in [('BLG01', 'ГЕРБ'), ('SOF46', 'Коалиция (ГЕРБ)')]]}


class MayorAnalysisTest(unittest.TestCase):
    def test_sofia_is_one_municipality_and_crosswalk_conflicts_fail(self):
        rows = [section('2346', '23', '11111'), section('2446', '24', '22222'), section('2546', '25')]
        codes = administrative_municipalities(rows, [{'ekatte': '11111', 'obshtina': 'S2317'}])
        self.assertEqual(set(codes.values()), {'SOF46'})
        result = mayor_analysis(rows, snapshot(), codes, {'changes': []})
        self.assertEqual(result['coverage']['totalMunicipalities'], 1)
        self.assertEqual(result['groups'][0]['municipalities'], 1)
        self.assertEqual(result['groups'][0]['sections'], 3)
        with self.assertRaises(ValueError):
            administrative_municipalities([section(), section(ekatte='00002')],
                [{'ekatte': '00001', 'obshtina': 'BLG01'}, {'ekatte': '00002', 'obshtina': 'BLG02'}])

    def test_eligible_denominators_exact_coalitions_and_unknowns_are_preserved(self):
        rows = [section(), section(spike=False), section(eligible=False),
                section('2346', '23'), section('9999', '9')]
        before = copy.deepcopy(rows)
        result = mayor_analysis(rows, snapshot(), {'0101': 'BLG01', '2346': 'SOF46'}, {'changes': []})
        self.assertEqual(result['coverage']['matchedSections'], 3)
        self.assertEqual(result['coverage']['eligibleSections'], 4)
        self.assertEqual(result['coverage']['unmatchedSections'], 1)
        group = next(row for row in result['groups'] if row['party'] == 'ГЕРБ')
        self.assertEqual(group['sections'], 2)
        self.assertEqual(group['spikeRate'], 50)
        self.assertEqual(group['candidate4Delta'], 50)
        self.assertEqual(group['deltaTurnoutPp'], 20)
        self.assertEqual(len(result['groups']), 2)
        self.assertEqual(rows, before)

    def test_known_changes_exclude_old_nomination_without_dropping_audit_row(self):
        change = {'administrativeCode': 'BLG01', 'date': '2024-06-23',
                  'note': 'По-късни избори', 'sourceUrl': 'https://www.cik.bg/decision'}
        result = mayor_analysis([section()], snapshot(), {'0101': 'BLG01'}, {'changes': [change]})
        self.assertEqual(result['groups'], [])
        self.assertEqual(result['coverage']['historicalOnlyMunicipalities'], 1)
        self.assertEqual(result['coverage']['matchedSections'], 0)
        self.assertFalse(result['municipalities'][0]['affiliationUsable'])
        self.assertEqual(result['municipalities'][0]['mayor'], 'Кмет')
        change['date'] = '2026-11-02'
        result = mayor_analysis([section()], snapshot(), {'0101': 'BLG01'}, {'changes': [change]})
        self.assertEqual(len(result['groups']), 1)

    def test_empty_scope_and_duplicate_mayors(self):
        result = mayor_analysis([], snapshot(), {}, {'changes': []})
        self.assertEqual(result['coverage']['totalMunicipalities'], 0)
        result = mayor_analysis([section(eligible=False)], snapshot(), {'0101': 'BLG01'}, {'changes': []})
        self.assertEqual(result['coverage']['matchedMunicipalities'], 0)
        self.assertEqual(result['coverage']['noEligibleMunicipalities'], 1)
        self.assertEqual(result['groups'], [])
        self.assertIsNone(result['municipalities'][0]['spikeRate'])
        data = snapshot()
        data['municipalities'].append(data['municipalities'][0])
        with self.assertRaises(ValueError):
            mayor_analysis([], data, {}, {'changes': []})


if __name__ == '__main__':
    unittest.main()
