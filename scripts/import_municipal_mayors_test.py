import unittest
from collections import Counter

from import_municipal_mayors import parse_candidates, round_results, section_rows, winner


class MunicipalMayorImportTest(unittest.TestCase):
    def test_candidate_party_retains_embedded_semicolons(self):
        rows = parse_candidates('101;0101. Банско;68;Местна коалиция (А; Б);ИМЕ НА КМЕТ;\n')
        self.assertEqual(rows['0101']['68']['party'], 'Местна коалиция (А; Б)')
        self.assertEqual(rows['0101']['68']['mayor'], 'ИМЕ НА КМЕТ')

    def test_duplicate_candidate_and_section_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate candidate'):
            parse_candidates('101;0101. Банско;1;Партия;Кмет;\n' * 2)
        with self.assertRaisesRegex(ValueError, 'Duplicate section'):
            section_rows('26;010100001;101;1;100;100;0\n' * 2)

    def test_first_round_majority_includes_no_support_and_is_strict(self):
        self.assertIsNone(winner(Counter({'1': 51, '2': 49}), 2))
        self.assertEqual(winner(Counter({'1': 52, '2': 48}), 2), '1')
        self.assertIsNone(winner(Counter({'1': 50, '2': 50}), 1))

    def test_runoff_uses_unique_maximum_and_rejects_tie(self):
        self.assertEqual(winner(Counter({'1': 51, '2': 49}), 5, runoff=True), '1')
        with self.assertRaisesRegex(ValueError, 'No unique'):
            winner(Counter({'1': 50, '2': 50}), 0, runoff=True)

    def test_documented_correction_replaces_original_section(self):
        protocol = ['26', '010100001', '101', '', '', '', '100', '100', '100', '0',
                    '0', '90', '0', '0', '90', '0', '0', '90', '0', '0', '0']
        tables = {
            'local_candidates_29.10.2023.txt': {'text': '101;0101. Банско;1;Партия;Кмет;'},
            'votes_29.10.2023.txt': {'text': '26;010100001;101;1;90;90;0'},
            'protocols_29.10.2023.txt': {'text': ';'.join(protocol)},
            'votes_16.03.2024.txt': {'text': '26;010100001;101;1;80;80;0'},
            'protocols_16.03.2024.txt': {'text': ';'.join(protocol[:17] + ['80'] + protocol[18:])},
            'readme_16.03.2024.txt': {'text': 'Court-ordered recount.'},
        }
        _, totals, _, corrections, discrepancies = round_results(tables)
        self.assertEqual(totals['0101']['1'], 80)
        self.assertEqual(corrections[0]['sections'], ['010100001'])
        self.assertEqual(discrepancies, [])
        del tables['readme_16.03.2024.txt']
        with self.assertRaisesRegex(ValueError, 'documentation'):
            round_results(tables)


if __name__ == '__main__':
    unittest.main()
