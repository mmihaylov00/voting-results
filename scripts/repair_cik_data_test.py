import csv
import gzip
import runpy
import unittest
from pathlib import Path


repair = runpy.run_path(str(Path(__file__).with_name('repair-cik-data.py')))
protocols = repair['protocols']
votes = repair['votes']
preferences = repair['preferences']


def row(form, fields, size=32):
    values = [''] * size
    values[0:2] = [str(form), '010100001']
    for position, value in fields.items():
        values[position - 1] = str(value)
    return values


class HistoricalDataTests(unittest.TestCase):
    def test_protocol_field_positions_and_machine_supplements(self):
        cases = [
            ('2016.11.06', row(1, {6: 600, 7: 7, 8: 429, 17: 429, 20: 14, 27: 10}),
             [600, 7, 429, 14, 10, 0, 429, 0]),
            ('2016.11.13', row(8, {6: 600, 7: 7, 8: 429, 18: 300, 19: 129, 20: 14, 28: 8, 29: 2}),
             [600, 7, 429, 14, 8, 2, 300, 129]),
            ('2017.03.26', row(1, {6: 646, 7: 17, 8: 470, 15: 470, 16: 25, 19: 10}),
             [646, 17, 470, 25, 10, 0, 470, 0]),
            ('2021.04.04', row(1, {6: 622, 7: 406, 11: 406, 12: 3, 21: 2}),
             [622, 0, 406, 3, 2, 0, 406, 0]),
            ('2021.04.04', row(8, {6: 622, 7: 406, 9: 300, 10: 106, 12: 3, 19: 2, 20: 1}),
             [622, 0, 406, 3, 2, 1, 300, 106]),
        ]
        for date, source, expected in cases:
            with self.subTest(date=date, form=source[0]):
                result, _ = protocols([source], date)
                self.assertEqual(result['010100001'][1:], expected)
        for date, shift in [('2021.07.11', 0), ('2021.11.14', 2), ('2022.10.02', 2)]:
            main = row(26, {position + shift: value for position, value in
                           {6: 600, 7: 7, 8: 305, 12: 100, 13: 205, 14: 3, 17: 2}.items()})
            machine = row(32, {17 + shift: 4})
            result, _ = protocols([main, machine], date)
            self.assertEqual(result['010100001'][1:], [600, 7, 305, 3, 2, 4, 100, 205])

    def test_votes_preserve_splits_and_classify_machine_forms(self):
        for form, expected in [(24, [10, 10, 0]), (26, [10, 10, 0]), (27, [10, 0, 10]),
                               (32, [10, 0, 10]), (41, [10, 0, 10])]:
            source = [str(form), '010100001', '1', '6', '10']
            self.assertEqual(list(votes([source], '2021.11.14', {}))[0][3:], expected)
        source = ['010100001', '1', '13', '10', '0', '0', '0']
        self.assertEqual(list(votes([source], '2016.11.06', {'010100001': 1}))[0][3:], [10, 10, 0])
        source = ['010100001', '1', '13', '10', '7', '3', '0']
        self.assertEqual(list(votes([source], '2016.11.06', {'010100001': 8}))[0][3:], [10, 7, 3])

    def test_nonzero_preferences_keep_paper_and_machine_separate(self):
        source = [['32', '010100001', '6', '101', '3'],
                  ['24', '010100001', '6', '101', '2'],
                  ['32', '010100001', '6', '102', '0'],
                  ['32', '010100001', '6', 'Без', '5'],
                  ['32', '010100001', '6', '0', '5'],
                  ['32', '010100001', '6', 'Общ брой', '5']]
        result = list(preferences(source, '2021.11.14', {}))
        self.assertEqual(result, [[1, '010100001', '6', '101', 3, 0, 3],
                                  [1, '010100001', '6', '101', 2, 2, 0]])

    def test_unknown_and_duplicate_protocol_forms_fail(self):
        with self.assertRaises(ValueError):
            protocols([row(99, {})], '2021.11.14')
        with self.assertRaises(ValueError):
            protocols([row(24, {}), row(24, {})], '2021.11.14')

    def test_imported_protocol_totals_match_original_cik_fields(self):
        expected = {
            '2022.10.02': (12932, 2601900, 9042, 87635),
            '2021.11.14': (13238, 2687307, 9487, 60786),
            '2021.11.21': (13234, 2310903, 3909, 34169),
            '2021.07.11': (13005, 2775754, 9342, 35201),
            '2021.04.04': (12941, 3334283, 86527, 47760),
            '2017.03.26': (12441, 3682151, 169009, 87850),
            '2016.11.06': (12340, 3943004, 119925, 214094),
            '2016.11.13': (12340, 3540829, 66036, 155412),
        }
        for date, totals in expected.items():
            with self.subTest(date=date):
                path = Path(__file__).resolve().parent.parent / 'public/data' / date / 'protocols.txt.gz'
                with gzip.open(path, 'rt') as source:
                    rows = list(csv.DictReader(source, delimiter=';'))
                actual = (len(rows), sum(int(r['voted']) for r in rows),
                          sum(int(r['discardedVotes']) for r in rows),
                          sum(int(r['noVotesPaper']) + int(r['noVotesMachine']) for r in rows))
                self.assertEqual(actual, totals)


if __name__ == '__main__':
    unittest.main()
