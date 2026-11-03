"""Identity, cohort and denominator checks for descriptive runoff benchmarks."""

from pathlib import Path
import tempfile
import unittest

from electoral_forensics_history import (
    _documented_source, build_runoff_benchmark, match_finalists,
)


FIRST_PARTIES = {'1': 'Име А и Име Б', '2': 'Име В и Име Г', '3': 'Отпаднала двойка'}
SECOND_PARTIES = {'8': 'ИМЕ А И ИМЕ Б', '9': 'Име В и Име Г'}


def record(section_id='050100001', second=False, **overrides):
    totals = {'8': 90, '9': 75} if second else {'1': 40, '2': 30, '3': 15}
    voted = 170 if second else 90
    return {
        'sectionId': section_id, 'regionId': str(int(section_id[:2])), 'regionName': 'Видин',
        'municipalityCode': section_id[:4], 'municipalityName': 'Община',
        'settlementEkatte': '00014', 'settlementName': 'с. Пример', 'address': 'Училище №1',
        'special': False, 'institutionReviewFlag': False, 'registered': 250, 'added': 2,
        'voted': voted, 'turnout': 100 * voted / 250, 'qualityFlags': [],
        'totalCandidateVotes': sum(totals.values()), 'noSupport': 5, 'invalidVotes': 0,
        'votesByParty': {ballot: {'total': votes} for ballot, votes in totals.items()}, **overrides,
    }


def election(records, second=False):
    return {'records': {row['sectionId']: row for row in records},
            'parties': SECOND_PARTIES if second else FIRST_PARTIES,
            'tables': {'sections': {'header': ['isMobile', 'isShip'], 'sha256': 'a' * 64}}}


def benchmark(first, second, small400=False):
    return build_runoff_benchmark(election(first), election(second, second=True), cycle=2021,
                                  round1_date='2021.11.14', round2_date='2021.11.21', small400=small400)


class HistoricalRunoffTests(unittest.TestCase):
    def test_finalists_follow_normalized_names_when_ballot_numbers_change(self):
        finalists = match_finalists(FIRST_PARTIES, SECOND_PARTIES)
        self.assertEqual([(row['ballot1'], row['ballot2']) for row in finalists], [('1', '8'), ('2', '9')])
        result = benchmark([record()], [record(second=True)])
        self.assertEqual([(row['votes1'], row['votes2'], row['deltaVotes']) for row in result['finalists']],
                         [(40, 90, 50), (30, 75, 45)])

    def test_ambiguous_missing_and_non_runoff_candidate_identities_fail(self):
        for first, second in [({**FIRST_PARTIES, '4': 'име а и име б'}, SECOND_PARTIES),
                              (FIRST_PARTIES, {'8': 'Друга двойка', '9': FIRST_PARTIES['2']}),
                              (FIRST_PARTIES, {}), (FIRST_PARTIES, {'8': FIRST_PARTIES['1']})]:
            with self.subTest(first=first, second=second), self.assertRaises(ValueError):
                match_finalists(first, second)

    def test_domestic_regular_identity_matched_arithmetic_valid_sample(self):
        first = [record(), record('320010001'), record('050100002', special=True),
                 record('050100003'), record('050100004'), record('050100005'), record('050100006')]
        second = [record(second=True), record('320010001', second=True),
                  record('050100002', second=True), record('050100003', second=True, voted=253),
                  record('050100004', second=True, address='Училище №2'),
                  record('050100005', second=True, institutionReviewFlag=True)]
        result = benchmark(first, second)
        self.assertEqual(result['sections'], 6)
        self.assertEqual(result['n'], 1)
        self.assertEqual(result['excludedN'], 5)
        self.assertEqual(result['quality']['abroadExcludedN'], 1)
        self.assertIn('official_special_section', result['quality']['exclusionReasons'])
        self.assertIn('missing_round2', result['quality']['exclusionReasons'])

    def test_registered_list_not_signed_voters_is_turnout_denominator(self):
        result = benchmark([record()], [record(second=True)])
        self.assertEqual(result['registered1'], 250)
        self.assertEqual(result['added1'], 2)
        self.assertEqual(result['turnout1'], 36)
        self.assertEqual(result['turnout2'], 68)
        self.assertEqual(result['deltaTurnoutPp'], 32)
        self.assertAlmostEqual(result['finalists'][0]['share1'], 100 * 40 / 90)
        self.assertAlmostEqual(result['finalists'][0]['share2'], 100 * 90 / 170)

    def test_small_size_cohort_is_fixed_from_first_round_and_stable_list_is_separate(self):
        first = [record(registered=400), record('050100002', registered=401)]
        second = [record(second=True, registered=500), record('050100002', second=True, registered=300)]
        result = benchmark(first, second, small400=True)
        self.assertEqual(result['sections'], 1)
        self.assertEqual(result['n'], 1)
        self.assertEqual(result['registered2'], 500)
        self.assertEqual(result['stableListSensitivity']['n'], 0)
        self.assertIsNone(result['stableListSensitivity']['turnout1'])

    def test_stable_list_sensitivity_includes_five_percent_and_excludes_more(self):
        first = [record(registered=200), record('050100002', registered=200)]
        second = [record(second=True, registered=210), record('050100002', second=True, registered=211)]
        result = benchmark(first, second)
        self.assertEqual(result['n'], 2)
        self.assertEqual(result['stableListSensitivity']['n'], 1)
        self.assertEqual(result['stableListSensitivity']['registered2'], 210)

    def test_missing_both_addresses_is_disclosed_and_one_missing_is_not_matched(self):
        result = benchmark([record(address='')], [record(second=True, address='')])
        self.assertEqual(result['n'], 1)
        self.assertEqual(result['matchingConfidence'], 'code_place_only_missing_addresses')
        self.assertTrue(any('липсват адреси' in text for text in result['limitations']))
        self.assertEqual(benchmark([record(address='')], [record(second=True)])['n'], 0)

    def test_zero_eligible_cohort_has_no_invented_rate_and_invalid_date_order_fails(self):
        result = benchmark([record(registered=0)], [record(second=True)])
        self.assertEqual(result['n'], 0)
        self.assertIsNone(result['turnout1'])
        self.assertIsNone(result['meanDeltaPp'])
        self.assertIsNone(result['finalists'][0]['share1'])
        with self.assertRaises(ValueError):
            build_runoff_benchmark(election([]), election([], second=True), cycle=2021,
                                   round1_date='2021.11.21', round2_date='2021.11.14')

    def test_unknown_method_and_added_review_do_not_become_hard_exclusions(self):
        first = record(qualityFlags=['unknown_voting_method'])
        second = record(second=True, added=669, reviewFlags=['added_exceed_signed'])
        result = benchmark([first], [second])
        self.assertEqual(result['n'], 1)
        self.assertEqual(result['added2'], 669)

    def test_source_documentation_preserves_actual_archive_url_without_fresh_verification_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / 'public/data/2021.11.14'
            directory.mkdir(parents=True)
            (directory / 'SOURCE.md').write_text('Official source: https://results.cik.bg/pvrns2021/tur1/export.zip\n'
                                               'Rebuilt with official fields.\nArchive SHA-256: `' + 'b' * 64 + '`.\n')
            source = _documented_source(root, '2021.11.14', election([]))
            self.assertEqual(source['sourceUrl'], 'https://results.cik.bg/pvrns2021/tur1/export.zip')
            self.assertEqual(source['trustStatus'], 'documented_official_archive_rebuild')
            self.assertFalse(source['freshArchiveVerification'])
            self.assertEqual(source['canonicalHashes'], {'sections': 'a' * 64})


if __name__ == '__main__':
    unittest.main()
