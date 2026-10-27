import csv
import gzip
import json
from pathlib import Path
import runpy
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


module = runpy.run_path(str(Path(__file__).with_name('import-cik-pages.py')))
Page = module['Page']
parse_protocol = module['parse_protocol']


def metrics(rows):
    return '<table>' + ''.join(f'<tr><td>{label}</td><td>{value}</td></tr>' for label, value in rows) + '</table>'


def candidates(first, second):
    return ('<table><tr><th>№</th><th>Кандидатски листи</th><th>Действителни гласове</th></tr>'
            f'<tr><td>1</td><td>А и Б<br>Първи комитет</td><td>{first}</td></tr>'
            f'<tr><td>2</td><td>В и Г<br>Втори комитет</td><td>{second}</td></tr></table>')


COMMON = '<h3>№ 010100001</h3>' + metrics([
    ('Брой на избирателите в избирателния списък при предаването му на СИК', 631),
    ('Брой на избирателите, вписани в допълнителната страница', 4),
    ('Брой на гласувалите според положените подписи', 95),
])
MIXED = COMMON + metrics([
    ('Брой на намерените в избирателните кутии недействителни гласове', 0),
    ('Брой на контролните разписки, от които по технически причини не може да се установи вотът', 0),
    ('Брой на действителните гласове с отбелязан вот „Не подкрепям никого“', 6),
]) + candidates(60, 29)
COMPONENT = COMMON + metrics([
    ('Брой на бюлетините, намерени в избирателната кутия', 59),
    ('Брой на действителните гласове с отбелязан вот „Не подкрепям никого“', 5),
]) + candidates(40, 14) + metrics([
    ('Брой на контролните разписки от машинното гласуване', 36),
    ('Брой на действителните гласове с отбелязан вот „Не подкрепям никого“', 1),
]) + candidates(20, 15) + metrics([
    ('Брой на контролните разписки от машинното гласуване', 0),
    ('Брой на действителните гласове с отбелязан вот „Не подкрепям никого“', 0),
]) + candidates(0, 0)


class CikPageTests(unittest.TestCase):
    def test_imported_abroad_sections_use_the_abroad_region_label(self):
        path = Path(__file__).resolve().parent.parent / 'public/data' / module['DATE'] / 'sections.txt.gz'
        with gzip.open(path, 'rt') as source:
            abroad = [row for row in csv.DictReader(source, delimiter=';') if row['regionId'] == '32']
        self.assertTrue(abroad)
        self.assertEqual({row['regionName'] for row in abroad}, {'Чужбина'})

    def test_mixed_summary_counts_are_not_duplicated_with_constituents(self):
        result = parse_protocol('010100001', MIXED, 33, COMPONENT)
        self.assertEqual(result['votes'], {'1': 60, '2': 29})
        self.assertEqual(result['paper'], {'1': 40, '2': 14})
        self.assertEqual(result['machine'], {'1': 20, '2': 15})
        self.assertEqual((result['noVotesPaper'], result['noVotesMachine']), (5, 1))
        self.assertEqual((result['protocolPaperVotes'], result['protocolMachineVotes']), (59, 36))

    def test_wrong_section_component_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Constituent protocol section'):
            parse_protocol('010100001', MIXED, 33, COMPONENT.replace('010100001', '010100002'))

    def test_unreadable_receipt_stays_in_cast_machine_count(self):
        summary = MIXED.replace('не може да се установи вотът</td><td>0',
                                'не може да се установи вотът</td><td>1')
        component = COMPONENT.replace('машинното гласуване</td><td>36',
                                      'машинното гласуване</td><td>37')
        result = parse_protocol('010100001', summary, 33, component)
        self.assertEqual(result['protocolMachineVotes'], 37)
        self.assertEqual(result['discardedVotes'], 1)
        self.assertEqual(sum(result['machine'].values()) + result['noVotesMachine'], 36)

    def test_missing_metric_is_not_converted_to_zero(self):
        with self.assertRaisesRegex(ValueError, 'Missing or invalid integer'):
            parse_protocol('010100001', MIXED.replace('631</td>', '</td>'), 33, COMPONENT)

    def test_directory_includes_plain_spans_and_foreign_place_names(self):
        html = ('<div class="pr-group" data-ik="01" data-city="Банско/гр.Банско">'
                '<div class="addr-group" data-addr="Училище"><span data-el="256">010100001</span></div></div>'
                '<div class="pr-group" data-ik="32" data-city="Австралия, Аделаида">'
                '<div class="addr-group" data-addr="Посолство"><span class="sikkp" data-el="256">320012001</span></div></div>')
        page = Page(html, read_sections=True)
        self.assertEqual(set(page.sections), {'010100001', '320012001'})
        self.assertEqual(page.sections['320012001']['cityName'], 'Австралия, Аделаида')
        self.assertEqual(Page(html).sections, {})

    def test_snapshot_preserves_published_percentages_and_sofia_timezone(self):
        html = ('<h5>Данни към 10:00 на 26.10.2026 при обработени 99.95% СИК протоколи в РИК</h5>'
                '<table><tr><th>№</th><th>Кандидатска двойка</th><th>Гласове</th><th>Разпределение</th></tr>'
                '<tr><td>1</td><td>А и Б<br>Комитет</td><td>2</td><td>66.667%</td></tr>'
                '<tr><td>-</td><td>Не подкрепям никого</td><td>1</td><td>33.333%</td></tr></table>')
        result = module['snapshot'](Page(html))
        self.assertEqual(result['updatedAt'], '2026-10-26T10:00:00+02:00')
        self.assertEqual(result['percentages'], {'1': '66.667%'})

    def test_supplement_inventory_does_not_create_duplicate_results(self):
        plans = module['protocol_plan']({'256': {'01': {'100001': {'0': 37, '1': 25, '2': 32}}}})
        self.assertEqual(plans['010100001'], ('protokoli/256/01/010100001.0.html', None, 37))
        with self.assertRaisesRegex(ValueError, 'Duplicate normalized section'):
            module['protocol_plan']({'256': {'01': {'100001': {'0': 37}, '0100001': {'0': 37}}}})

    def test_unique_settlement_lookup_uses_municipality_and_region(self):
        municipalities = [dict(name='Банско', oblast='BLG', obshtina='BLG01', ekatte='02676')]
        settlements = [dict(name='Банско', obshtina='BLG01', ekatte='02676'),
                       dict(name='Банско', obshtina='OTHER', ekatte='99999')]
        resolve = module['settlement_resolver'](municipalities, settlements)
        section = dict(regionId='1', cityName='гр.Банско', municipalityName='Банско')
        self.assertEqual(resolve('010100001', section), '02676')
        self.assertEqual(resolve('020100001', dict(section, regionId='2')), '')
        self.assertEqual(resolve('010100001', dict(section, municipalityName='Unknown')), '')

    def test_settlement_type_disambiguates_town_and_village(self):
        municipalities = [dict(name='Костенец', oblast='SFO', obshtina='SFO25', ekatte='38902')]
        settlements = [dict(name='Костенец', obshtina='SFO25', ekatte='38902', t_v_m='гр.'),
                       dict(name='Костенец', obshtina='SFO25', ekatte='38916', t_v_m='с.')]
        resolve = module['settlement_resolver'](municipalities, settlements)
        self.assertEqual(resolve('262500001', dict(regionId='26', cityName='с.Костенец', municipalityName='Костенец')), '38916')

    def test_fresh_source_check_keeps_the_existing_cache_pinned(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            target = cache / 'rezultati/index.html'
            target.parent.mkdir()
            target.write_text('<table>previous snapshot</table>')
            response = SimpleNamespace(content=b'<table>current snapshot</table>', raise_for_status=lambda: None)
            session = SimpleNamespace(get=lambda *args, **kwargs: response)
            fetcher = module['Fetcher'].__new__(module['Fetcher'])
            fetcher.cache, fetcher.local = cache, SimpleNamespace(session=session)
            with patch('time.sleep'):
                current = fetcher.get('rezultati/index.html', fresh=True)
            self.assertEqual(current, '<table>current snapshot</table>')
            self.assertEqual(target.read_text(), '<table>previous snapshot</table>')

    def test_final_election_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'src/assets').mkdir(parents=True)
            catalog = root / 'src/assets/elections.json'
            original = json.dumps([{'date': module['DATE'], 'type': 'presidential'}])
            catalog.write_text(original)
            stage = root / 'stage'
            stage.mkdir()
            with self.assertRaisesRegex(ValueError, 'final election'):
                module['publish'](root, stage, {'date': module['DATE']})
            self.assertEqual(catalog.read_text(), original)
            self.assertTrue(stage.exists())

    def test_catalog_failure_restores_previous_provisional_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'src/assets').mkdir(parents=True)
            destination = root / 'public/data' / module['DATE']
            destination.mkdir(parents=True)
            (destination / 'previous.txt').write_text('verified previous results')
            catalog = root / 'src/assets/elections.json'
            entry = dict(date=module['DATE'], type='presidential', round=1, provisional={'processedPercent': 50})
            original = json.dumps([entry])
            catalog.write_text(original)
            stage = root / 'stage'
            stage.mkdir()
            (stage / 'new.txt').write_text('new results')
            with patch.object(Path, 'replace', side_effect=OSError('catalog write failed')):
                with self.assertRaises(OSError):
                    module['publish'](root, stage, entry)
            self.assertEqual((destination / 'previous.txt').read_text(), 'verified previous results')
            self.assertEqual(catalog.read_text(), original)
            self.assertFalse((destination / 'new.txt').exists())


if __name__ == '__main__':
    unittest.main()
