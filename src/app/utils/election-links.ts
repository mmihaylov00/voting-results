export function getCikUrl(date: string): string {
  const historicalPaths: Record<string, string> = {
    '2026.10.25': 'pvr202610',
    '2022.10.02': 'ns2022',
    '2021.11.21': 'pvrns2021/tur2',
    '2021.11.14': 'pvrns2021/tur1',
    '2021.07.11': 'pi2021_07',
    '2021.04.04': 'pi2021',
    '2017.03.26': 'pi2017',
    '2016.11.13': 'pvrnr2016/tur2',
    '2016.11.06': 'pvrnr2016/tur1',
  };
  if (historicalPaths[date]) return `https://results.cik.bg/${historicalPaths[date]}/rezultati/index.html`;
  if (date.startsWith('2023.04')) return 'https://results.cik.bg/ns2023/search/index.html#';
  if (date.startsWith('2024.06')) return 'https://results.cik.bg/europe2024/search/index.html';
  if (date.startsWith('2024.10')) return 'https://results.cik.bg/pe202410/search/index.html';
  if (date.startsWith('2026.04')) return 'https://results.cik.bg/pe202604/search/index.html';
  return '';
}
