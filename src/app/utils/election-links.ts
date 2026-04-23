export function getCikUrl(date: string): string {
  if (date.startsWith('2023.04')) return 'https://results.cik.bg/ns2023/search/index.html#';
  if (date.startsWith('2024.06')) return 'https://results.cik.bg/europe2024/search/index.html';
  if (date.startsWith('2024.10')) return 'https://results.cik.bg/pe202410/search/index.html';
  if (date.startsWith('2026.04')) return 'https://results.cik.bg/pe202604/search/index.html';
  return '';
}
