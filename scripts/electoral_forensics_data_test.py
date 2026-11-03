"""Focused tests for denominators, source identity and conservative matching."""

import copy
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from electoral_forensics_data import (
    _method, _retained_evidence, _section, _votes, load_election, match_records,
    normalize_identity, percentage, retain_input_evidence, size_group, verify_official_archive,
)


class ForensicsDataTests(unittest.TestCase):
    def record(self):
        return {'sectionId': '050100001', 'regionId': '5', 'municipalityCode': '0501',
                'settlementEkatte': '00014', 'settlementName': 'с. Абланица',
                'address': 'С. АБЛАНИЦА, УЛ. "ПЪРВА" № 3', 'special': False}

    def test_registered_denominator_is_not_actual_voters(self):
        self.assertEqual(percentage(170, 250), 68)
        self.assertEqual(percentage(170, 100), 170)
        self.assertIsNone(percentage(170, 0))
        self.assertEqual([size_group(n) for n in [299, 300, 400, 401, 700, 701]],
                         ['under300', '300to400', '300to400', '401to700', '401to700', 'over700'])

    def test_method_requires_form_and_depends_on_election_rules(self):
        self.assertEqual(_method(26, '2026.10.25'), 'interrupted')
        self.assertEqual(_method(33, '2026.11.01'), 'interrupted')
        self.assertEqual(_method(26, '2026.04.19'), 'machine')
        self.assertEqual(_method(24, '2026.11.01'), 'paper')
        self.assertEqual(_method(999, '2026.11.01'), 'unknown')

    def test_only_typographic_address_changes_match(self):
        left, right = self.record(), self.record()
        right['address'] = 'с.Абланица ул.Първа №3'
        self.assertTrue(match_records(left, right)['comparable'])
        right['address'] = 'с.Абланица ул.Първа №4'
        self.assertEqual(match_records(left, right)['status'], 'changed')
        self.assertFalse(match_records(left, right)['comparable'])

    def test_changed_id_geography_and_special_sections_are_excluded(self):
        left = self.record()
        for field, value in [('sectionId', '050100002'), ('settlementEkatte', '00015'),
                             ('municipalityCode', '0502'), ('regionId', '6')]:
            right = copy.deepcopy(left)
            right[field] = value
            self.assertFalse(match_records(left, right)['comparable'])
        right = copy.deepcopy(left)
        right['special'] = True
        self.assertEqual(match_records(left, right)['status'], 'special')
        self.assertEqual(match_records(left, None)['status'], 'unmatched')

    def test_administrative_alias_is_disclosed_but_official_name_change_is_excluded(self):
        left, right = self.record(), self.record()
        left.update(municipalityName='Добрич-селска', municipalityNameSource='administrative_catalog')
        right.update(municipalityName='Добричка', municipalityNameSource='election_record')
        result = match_records(left, right)
        self.assertTrue(result['comparable'])
        self.assertIn('municipality_display_labels_differ', result['identityNotes'])
        left['municipalityNameSource'] = 'election_record'
        self.assertFalse(match_records(left, right)['comparable'])

    def test_original_party_registrations_and_second_machine_are_preserved(self):
        header = ['form', 'sectionId', 'region', 'partyId', 'total', 'paper', 'machine', 'extra'] * 1
        values = ['26', '050100001', '5', '8', '114', '108', '5', '1', '13', '6', '6', '0', '0']
        parties = {'8': 'ДПС-Ново начало', '13': 'АЛИАНС ЗА ПРАВА И СВОБОДИ'}
        votes, total, flags = _votes(values, header, parties, {}, '5', 125, 5, '2024.10.27')
        self.assertEqual(total, 120)
        self.assertEqual(votes['8']['machine'], 6)
        self.assertEqual(votes['8']['machineSecond'], 1)
        self.assertEqual(votes['8']['name'], 'ДПС-Ново начало')
        self.assertEqual(votes['13']['name'], 'АЛИАНС ЗА ПРАВА И СВОБОДИ')
        self.assertAlmostEqual(votes['8']['share'], 95)
        self.assertAlmostEqual(votes['8']['shareOfValidIncludingNoSupport'], 91.2)
        self.assertEqual(flags, [])

    def test_ekatte_and_unescaped_address_are_preserved(self):
        header = 'sectionId;regionId;regionName;municipalityId;cityName;sectionName;lat;lan;isMobile;isShip;machineCount'.split(';')
        values = '050100001;5;05. Видин;14;с.Абланица;Село;ул.Първа;23.1;43.2;1;0;0'.split(';')
        section = _section(values, header, {}, {})
        self.assertEqual(section['settlementEkatte'], '00014')
        self.assertEqual(section['address'], 'Село;ул.Първа')
        self.assertEqual(section['coordinates'], {'longitude': 23.1, 'latitude': 43.2})
        self.assertTrue(section['special'])
        self.assertEqual(normalize_identity('№3'), normalize_identity('No3'))

    def test_care_institutions_are_review_flags_and_ordinary_venues_remain_regular(self):
        header = 'sectionId;regionId;regionName;municipalityId;cityName;sectionName;lat;lan;isMobile;isShip;machineCount'.split(';')
        positive = ['село Гара Орешец, ДСХ ул. Георги Димитров №14', 'ЦНСТПЛФУ, ул. Шест №2',
                    'СБАЛПФЗ гр. Враца', 'СБПЛББ-Роман', 'СБР "Свети Мина"',
                    'Дом за пълнолетни лица с физически увреждания', 'Старчески дом "Приста"',
                    'Център за психично здраве', 'Комплексен онкологичен център', 'ДПБ', 'ДПХ']
        negative = ['С. КУТОВО, училище "Св. Св. Кирил и Методий"', 'Салон на читалището',
                    'Младежки дом', 'Културен дом', 'Пенсионерски клуб', 'Бивш здравен дом',
                    'Център за социална рехабилитация и интеграция (клуб)']
        for address in positive + negative:
            values = ['051600025', '5', 'Видин', '00014', 'с. Орешец', address, '', '', '0', '0', '0']
            with self.subTest(address=address):
                section = _section(values, header, {}, {})
                self.assertEqual(section['institutionReviewFlag'], address in positive)
                self.assertFalse(section['special'])

    def test_loader_retains_raw_denominators_and_does_not_invent_method(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / 'public/data/2026.11.01'
            directory.mkdir(parents=True)
            sources = {
                'sections': ('sectionId;regionId;regionName;municipalityId;cityName;sectionName;lat;lan;isMobile;isShip;machineCount\n'
                             '050100001;5;Видин;14;с.Абланица;Училище;23.1;43.2;0;0;1\n'),
                'protocols': ('sectionId;totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes\n'
                              '050100001;250;2;170;0;0;0;100;70\n'),
                'votes': ('sectionId;regionId;partyId;total;paper;machine;partyId;total;paper;machine\n'
                          '050100001;5;4;100;100;0;25;70;0;70\n'),
                'cik_parties': 'partyId;partyName\n4;Първа двойка\n25;Втора двойка\n',
            }
            for name, text in sources.items():
                (directory / (name + '.txt')).write_text(text, encoding='utf-8')
            (directory / 'source-results.json').write_text(json.dumps({'protocolDiscrepancies': [
                {'sectionId': '050100001', 'regionId': '5', 'field': 'protocolMachineVotes',
                 'sectionsTotal': 100, 'rikTotal': 101}]}), encoding='utf-8')
            data = load_election(root, '2026.11.01', {}, {})
            record = data['records']['050100001']
            self.assertEqual(record['registered'], 250)
            self.assertEqual(record['added'], 2)
            self.assertEqual(record['voted'], 170)
            self.assertEqual(record['sizeGroup'], 'under300')
            self.assertEqual(record['turnout'], 68)
            self.assertAlmostEqual(record['turnoutWithAdded'], 100 * 170 / 252)
            self.assertEqual(record['votingMethod'], 'unknown')
            self.assertEqual(record['raw']['protocol'][1:4], ['250', '2', '170'])
            self.assertEqual(record['sourceRefs']['protocols']['line'], 2)
            self.assertEqual(len(record['sourceRefs']['protocols']['sha256']), 64)
            self.assertEqual(record['sourceDiscrepancies'][0]['field'], 'protocolMachineVotes')
            self.assertEqual(record['sourceDiscrepancies'][0]['rikTotal'], 101)
            self.assertEqual(record['qualityFlags'], ['unknown_voting_method'])

    def test_official_archive_verification_pins_canonical_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / 'public/data/2026.04.19'
            directory.mkdir(parents=True)
            sources = {'protocols': 'sectionId;totalA;voted\n050100001;250;170\n',
                       'votes': 'sectionId;partyId;total\n050100001;8;170\n',
                       'cik_parties': 'partyId;partyName\n8;Отделна регистрация\n'}
            archive_path = root / 'official.zip'
            with zipfile.ZipFile(archive_path, 'w') as archive:
                for name, text in sources.items():
                    (directory / (name + '.txt')).write_text(text, encoding='utf-8')
                    archive.writestr(name + '_19.04.2026.txt', text.split('\n', 1)[1])
            self.assertEqual(verify_official_archive(root, '2026.04.19', archive_path)['status'], 'verified')
            retain_input_evidence(root, '2026.04.19', archive=archive_path)
            self.assertEqual(_retained_evidence(root, '2026.04.19')[1]['verification']['status'], 'verified')
            (directory / 'protocols.txt').write_text(sources['protocols'].replace('170', '171'), encoding='utf-8')
            self.assertEqual(verify_official_archive(root, '2026.04.19', archive_path)['status'], 'mismatch')
            with self.assertRaisesRegex(ValueError, 'changed after official verification'):
                _retained_evidence(root, '2026.04.19')


if __name__ == '__main__':
    unittest.main()
