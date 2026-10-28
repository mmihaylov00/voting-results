import csv
import gzip
import json
import runpy
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import zipfile


repair = runpy.run_path(str(Path(__file__).with_name('repair-cik-data.py')))
protocols = repair['protocols']
votes = repair['votes']
preferences = repair['preferences']
sections_2026 = repair['sections_2026']


def row(form, fields, size=32):
    values = [''] * size
    values[0:3] = [str(form), '010100001', '1']
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
            '2026.10.25': (12719, 1525034, 3279, 67353),
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


class Official2026Tests(unittest.TestCase):
    date = '2026.10.25'

    def test_paper_machine_and_mixed_fields_follow_the_new_readme(self):
        for form in [24, 28]:
            source = row(form, {9: 600, 10: 7, 11: 305, 12: 300, 13: 3, 17: 2}, 28)
            result, _ = protocols([source], self.date)
            self.assertEqual(result['010100001'][1:], [600, 7, 305, 3, 2, 0, 300, 0])
        for form, machine_form in [(25, 32), (29, 41)]:
            main = row(form, {9: 600, 10: 7, 11: 305, 14: 304}, 28)
            first = row(machine_form, {26: 200, 27: 190, 28: 10}, 28)
            second = row(machine_form, {26: 104, 27: 101, 28: 3}, 28)
            for source in [main, first, second]:
                source[2] = '1'
            result, _ = protocols([first, main, second], self.date)
            self.assertEqual(result['010100001'][1:], [600, 7, 305, 0, 0, 13, 0, 304])
        for form in [26, 30]:
            source = row(form, {9: 600, 10: 7, 11: 305, 12: 100, 13: 3, 17: 2,
                               18: 120, 19: 110, 20: 9, 21: 1, 22: 85, 23: 80, 24: 3, 25: 2}, 28)
            result, _ = protocols([source], self.date)
            self.assertEqual(result['010100001'][1:], [600, 7, 305, 6, 2, 12, 100, 205])

    def test_rejects_missing_counts_and_orphan_or_duplicate_protocols(self):
        main = row(24, {9: 600, 10: 0, 11: 2, 12: 2, 13: 0, 17: 0}, 28)
        main[2] = '1'
        machine = row(32, {26: 2, 27: 2, 28: 0}, 28)
        machine[2] = '1'
        invalid = [[main, main], [machine], [main, machine], [row(99, {}, 28)],
                   [row(24, {}, 28)], [row(25, {9: 2, 10: 0, 11: 2, 14: 2}, 28)]]
        for rows in invalid:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                protocols(rows, self.date)
        missing = main.copy()
        missing[10] = ''
        with self.assertRaises(ValueError):
            protocols([missing], self.date)

    def test_preserves_paper_machine_vote_splits_and_rejects_invalid_components(self):
        source = ['010100001', '1', '4', '10', '3', '7', '4', '3']
        self.assertEqual(list(votes([source], self.date, {})), [['010100001', '1', '4', 10, 3, 7]])
        for values in [['10', '2', '7', '4', '3'], ['10', '3', '7', '4', '2'], ['10', '-1', '11', '5', '6']]:
            with self.assertRaises(ValueError):
                list(votes([source[:3] + values], self.date, {}))
        with self.assertRaises(ValueError):
            list(votes([source[:-1]], self.date, {}))

    def test_keeps_geography_aligned_after_unescaped_address_separators(self):
        source = ['010100001', '1', '01. БЛАГОЕВГРАД', '02676', 'гр.Банско',
                  'Училище', ' улица 1', '23.4', '41.8', '0', '0', '1']
        result = sections_2026([source])['010100001']
        self.assertEqual(result[2], 'БЛАГОЕВГРАД')
        self.assertEqual(result[5:], ['Училище, улица 1', '23.4', '41.8', '0', '0', '1'])
        with self.assertRaises(ValueError):
            sections_2026([source, source])
        for index, value in [(3, ''), (7, 'NaN'), (8, '91'), (9, '3')]:
            invalid = source.copy()
            invalid[index] = value
            with self.subTest(index=index), self.assertRaises(ValueError):
                sections_2026([invalid])

    def fixture(self, root):
        dataset = root / 'public/data' / self.date
        dataset.mkdir(parents=True)
        (dataset / 'source-results.json').write_text('previous snapshot')
        catalog = root / 'src/assets/elections.json'
        catalog.parent.mkdir(parents=True)
        catalog.write_text(json.dumps([{'date': self.date, 'type': 'presidential', 'round': 1,
                                       'provisional': {'processedPercent': 100}}]))
        archive = root / 'export.zip'
        main = row(24, {9: 600, 10: 0, 11: 2, 12: 2, 13: 0, 17: 1}, 28)
        main[2] = '1'
        with zipfile.ZipFile(archive, 'w') as z:
            for name, text in {
                'readme': 'ПРЕЗИДЕНТ 10.2026',
                'sections': '010100001;1;01. БЛАГОЕВГРАД;02676;гр.Банско;Адрес;23.4;41.8;0;0;0',
                'protocols': ';'.join(main),
                'cik_candidates': '\n'.join(f'{i};Партия {i};1;Кандидат {i}' for i in range(1, 28)),
                'votes': '010100001;1;' + ';'.join(f'{i};0;0;0;0;0' for i in range(1, 28)),
            }.items():
                z.writestr(f'data/{name}_25.10.2026.txt', text)
        return archive, dataset, catalog

    def test_official_import_removes_provisional_state_and_can_be_repeated(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, dataset, catalog = self.fixture(root)
            for _ in range(2):
                repair['repair'](archive, self.date, root)
                self.assertNotIn('provisional', json.loads(catalog.read_text())[0])
                self.assertFalse((dataset / 'source-results.json').exists())
                self.assertIn('Archive SHA-256:', (dataset / 'SOURCE.md').read_text())
                with gzip.open(dataset / 'sections.txt.gz', 'rt') as stream:
                    self.assertIn('lat;lan;isMobile;isShip;machineCount', stream.readline())

    def test_catalog_failure_restores_the_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, dataset, catalog = self.fixture(root)
            before = catalog.read_bytes()
            original = Path.replace
            def replace(path, target):
                if path.name.endswith('.json.cik-import'):
                    raise OSError('catalog unavailable')
                return original(path, target)
            with patch.object(Path, 'replace', replace), self.assertRaises(OSError):
                repair['repair'](archive, self.date, root)
            self.assertEqual((dataset / 'source-results.json').read_text(), 'previous snapshot')
            self.assertEqual(catalog.read_bytes(), before)
            self.assertEqual(list(dataset.parent.iterdir()), [dataset])


if __name__ == '__main__':
    unittest.main()
