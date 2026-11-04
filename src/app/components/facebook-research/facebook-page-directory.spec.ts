import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { FacebookPageDirectoryComponent } from './facebook-page-directory';
import { FacebookDirectoryEntry } from './facebook-research.models';

function entry(overrides: Partial<FacebookDirectoryEntry>): FacebookDirectoryEntry {
  return {
    id: 'linked', name: 'Градски новини', aliases: ['Town News'], status: 'publisher-linked',
    facebookUrl: 'https://www.facebook.com/townnews', websiteUrl: 'https://townnews.example/',
    regional: true, coverage: 'Варна и Провадия', regions: ['Варна', 'Провадия'],
    sources: [{ url: 'https://townnews.example/contacts', note: 'Сайтът на издателя сочи към Facebook.' }],
    notes: ['Facebook страницата още не е проверена.'], samplePageId: null,
    ...overrides,
  };
}

const entries = [
  entry({}),
  entry({ id: 'sample', name: 'В извадката', aliases: [], status: 'in-sample', regional: false,
    coverage: 'България', regions: [], samplePageId: 'sample-page' }),
  entry({ id: 'other-region', name: 'Русенски новини', aliases: [], coverage: 'Русе и региона', regions: ['Русе'] }),
  entry({ id: 'unresolved', name: 'Търсена страница', aliases: [], status: 'unresolved', regional: null,
    coverage: '', regions: [], facebookUrl: null, websiteUrl: null, sources: [] }),
];

function setup(rows = entries) {
  TestBed.configureTestingModule({ imports: [FacebookPageDirectoryComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(FacebookPageDirectoryComponent);
  fixture.componentRef.setInput('directory', { checkedAt: '2026-11-04', entries: rows });
  fixture.detectChanges();
  return fixture;
}

describe('Facebook Page directory', () => {
  it('combines verification, geographic and alias search filters, supports sorting and resets them', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const controls = component.table()!;
    expect(component.regionOptions().map(option => option.value)).toEqual(['', 'Варна', 'Провадия', 'Русе']);
    component.statusFilter.set('publisher-linked');
    component.scopeFilter.set('regional');
    component.regionFilter.set('Варна');
    controls.query.set('town news');
    fixture.detectChanges();
    expect(controls.viewRows().map(row => row.id)).toEqual(['linked']);
    expect((fixture.nativeElement as HTMLElement).querySelector('tbody')?.textContent).toContain('Регионална');
    controls.query.set('русе');
    fixture.detectChanges();
    expect(controls.viewRows()).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Няма страници по тези филтри.');
    component.resetFilters();
    fixture.detectChanges();
    expect(controls.viewRows()).toHaveLength(entries.length);
    controls.sort('name');
    const ascending = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'bg'));
    expect(controls.viewRows().map(row => row.id)).toEqual(ascending.map(row => row.id));
    controls.sort('name');
    expect(controls.viewRows().map(row => row.id)).toEqual(ascending.reverse().map(row => row.id));
    component.scopeFilter.set('unknown');
    fixture.detectChanges();
    expect(controls.viewRows().map(row => row.id)).toEqual(['unresolved']);
    fixture.destroy();
  });

  it('opens row details with verification limits, aliases, notes and publisher evidence links', () => {
    const fixture = setup();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLTableRowElement>('.directory-row')!.click();
    fixture.detectChanges();
    const dialog = element.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Самата страница и публикациите ѝ още не са проверени.');
    expect(dialog.textContent).toContain('Town News');
    expect(dialog.textContent).toContain(entries[0].notes[0]);
    expect(dialog.querySelector('.source-list a')?.getAttribute('href')).toBe(entries[0].sources[0].url);
    expect(dialog.querySelector('.source-list a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(dialog.querySelector('.source-list a app-map-icon')).not.toBeNull();
    expect(dialog.querySelector('button')?.textContent).not.toContain('Публикации');
    fixture.componentInstance.selectedEntry.set(null);
    fixture.detectChanges();
    expect(element.querySelector('dialog')).toBeNull();
    fixture.destroy();
  });

  it('offers a posts action only for existing sample Pages and emits that sample ID', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const selection = vi.fn();
    component.pageSelect.subscribe(selection);
    component.openEntry(entries[0]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('dialog button')].some(button => button.textContent?.includes('Публикации'))).toBe(false);
    component.showPosts(entries[0]);
    expect(selection).not.toHaveBeenCalled();
    component.openEntry(entries[1]);
    fixture.detectChanges();
    const postsButton = [...element.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent?.includes('Публикации'))!;
    expect(postsButton).toBeDefined();
    postsButton.click();
    fixture.detectChanges();
    expect(selection).toHaveBeenCalledExactlyOnceWith('sample-page');
    expect(element.querySelector('dialog')).toBeNull();
    fixture.destroy();
  });

  it('exports the complete current filtered and sorted rows, including rows outside the viewport', () => {
    const matching = Array.from({ length: 35 }, (_, index) => entry({ id: `match-${index}`, name: `Варна ${String(index).padStart(2, '0')}` }));
    const fixture = setup([...matching, ...entries.slice(1)]);
    const component = fixture.componentInstance;
    const controls = component.table()!;
    component.statusFilter.set('publisher-linked');
    component.regionFilter.set('Варна');
    controls.query.set('Варна');
    controls.sort('name');
    controls.sort('name');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tr[data-virtual-index]').length).toBeLessThan(35);
    element.querySelector<HTMLButtonElement>('[data-directory-export]')!.click();
    fixture.detectChanges();
    const csv = component.csvData()!;
    expect(csv.rows).toHaveLength(35);
    expect(csv.rows.map(row => row[0])).toEqual(controls.viewRows().map(row => row.name));
    expect(csv.rows[0][0]).toBe('Варна 34');
    expect(csv.rows.every(row => row.length === csv.headers.length)).toBe(true);
    expect(csv.rows[0][csv.headers.indexOf('Статус')]).toBe('Връзка от издател');
    expect(csv.rows.some(row => row.includes('В извадката'))).toBe(false);
    expect(element.querySelector('app-csv-export-modal')).not.toBeNull();
    fixture.destroy();
  });
});
