import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { Region } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ContestantSummary } from '../../utils/contestant-profile.util';
import { ContestantDetailModalComponent } from '../contestant-detail-modal/contestant-detail-modal';
import { ContestantDirectoryComponent } from './contestant-directory';
import { SelectComponent } from '../ui/select/select';
import { PreferenceDirectoryComponent } from './preference-directory';

@Component({ selector: 'app-contestant-detail-modal', standalone: true, template: '<button type="button" (click)="close.emit()">Затвори профила</button>' })
class ProfileStub {
  @Input() partyName = '';
  @Input() partyId = '';
  @Input() currentDate = '';
  @Output() close = new EventEmitter<void>();
}

@Component({ selector: 'app-preference-directory', standalone: true, template: '<p>Списък с преференции</p>' })
class PreferencesStub {}

async function setup(presidential = false) {
  const dates = [
    { date: '2024.10.27', name: 'Октомври 2024', type: presidential ? 'presidential' : 'governmental', round: presidential ? 2 : undefined },
    { date: '2023.04.02', name: 'Април 2023', type: presidential ? 'presidential' : 'governmental', round: presidential ? 1 : undefined },
  ];
  const region = (partyVotes: Record<string, number>): Region => ({ id: '01', name: 'Район', total: 1000, voted: 1000, partyVotes });
  const summaries: Record<string, ContestantSummary> = {
    '2024.10.27': { parties: { '1': presidential ? 'Румен Георгиев Радев и Илияна Малинова Йотова' : 'ГЕРБ-СДС',
      '2': presidential ? 'Анастас Георгиев Герджиков и Невяна Михайлова Митева-Матеева' : 'БСП', '0': 'Не подкрепям никого' }, regions: [region({ '1': 5, '2': 2, '0': 1 })] },
    '2023.04.02': { parties: { '5': presidential ? 'Румен Георгиев Радев и Илияна Йотова' : 'ПП ГЕРБ',
      '9': presidential ? 'Татяна Дончева и Минчо Спасов' : 'Историческа партия' }, regions: [region({ '5': 200, '9': 100 })] },
  };
  const service = { electionType: presidential ? 'presidential' : 'governmental', getDates: () => dates,
    getAllData: vi.fn(() => of(summaries)), getSections: vi.fn() };
  TestBed.configureTestingModule({ imports: [ContestantDirectoryComponent], deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [provideRouter([]), { provide: ElectionService, useValue: service },
      { provide: ThemeService, useValue: { darkMode: () => false } }],
  }).overrideComponent(ContestantDirectoryComponent, {
    remove: { imports: [ContestantDetailModalComponent, PreferenceDirectoryComponent] }, add: { imports: [ProfileStub, PreferencesStub] },
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(ContestantDirectoryComponent);
  return { fixture, component: fixture.componentInstance, service, summaries, element: fixture.nativeElement as HTMLElement };
}

describe('contestant directory', () => {
  it('lists historical profiles, opens the correct archive identity and keeps percentages below one intact', async () => {
    const { fixture, component, service, element } = await setup();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.entries()).toHaveLength(3);
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"] button')).toHaveLength(3);
    const card = element.querySelector<HTMLButtonElement>('button[aria-label="Отвори профил: ГЕРБ-СДС"]')!;
    expect(card.textContent).toContain('0.50%');
    const image = card.querySelector('img')!;
    image.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('ГЕ');
    card.click();
    await fixture.whenStable(); fixture.detectChanges();
    const profile = fixture.debugElement.query(By.directive(ProfileStub)).componentInstance as ProfileStub;
    expect([profile.partyName, profile.partyId, profile.currentDate]).toEqual(['ГЕРБ-СДС', '1', '2024.10.27']);
    profile.close.emit(); fixture.detectChanges();
    expect(component.selectedContestant()).toBeNull();
    expect(service.getSections).not.toHaveBeenCalled();
  });

  it('searches current and historical names without refetching summaries and shows an empty result', async () => {
    const { fixture, component, service, element } = await setup();
    await fixture.whenStable(); fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('#contestant-directory-search')!;
    input.value = 'пп герб'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(component.filteredCards().map(entry => entry.displayName)).toEqual(['ГЕРБ-СДС']);
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"] button')).toHaveLength(1);
    component.search.set('Липсващо име'); fixture.detectChanges();
    expect(element.textContent).toContain('Няма профили за това търсене.');
    component.search.set('   '); fixture.detectChanges();
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"] button')).toHaveLength(3);
    expect(service.getAllData).toHaveBeenCalledOnce();
  });

  it('renders presidential people with portraits and links between both directory types', async () => {
    const { fixture, component, element } = await setup(true);
    await fixture.whenStable(); fixture.detectChanges();
    const card = element.querySelector<HTMLButtonElement>('button[aria-label="Отвори профил: Румен Георгиев Радев"]')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('img')?.getAttribute('src')).toContain('person-rumen-radev.jpg');
    expect(component.entries().find(entry => entry.displayName === 'Румен Георгиев Радев')?.participationCount).toBe(2);
    component.search.set('румен радев'); fixture.detectChanges();
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"] button')).toHaveLength(1);
    expect(component.filteredCards()[0].displayName).toBe('Румен Георгиев Радев');
    expect(element.querySelector('nav a[aria-current="page"]')?.getAttribute('href')).toBe('/presidential/contestants');
    expect(element.querySelector('nav a')?.getAttribute('href')).toBe('/governmental/contestants');
  });

  it.each([false, true])('defaults to all elections and filters historical participation without refetching (presidential: %s)', async presidential => {
    const { fixture, component, service, element } = await setup(presidential);
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.selectedDate()).toBe('all');
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(component.filteredCards()).toHaveLength(3);
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    expect(select.options()[0]).toMatchObject({ value: 'all', label: 'Всички избори' });
    select.valueChange.emit('2024.10.27'); fixture.detectChanges();
    expect(component.filteredCards()).toHaveLength(2);
    expect(component.filteredCards().every(entry => entry.date === '2024.10.27')).toBe(true);

    select.valueChange.emit('2023.04.02'); fixture.detectChanges();
    expect(component.filteredCards()).toHaveLength(2);
    expect(component.filteredCards().every(entry => entry.date === '2023.04.02')).toBe(true);
    expect(component.filteredCards()[0].votes).toBe(200);
    expect(component.filteredCards()[0].participationCount).toBe(2);
    component.search.set(presidential ? 'Татяна Дончева' : 'Историческа партия'); fixture.detectChanges();
    expect(component.filteredCards()).toHaveLength(1);
    select.valueChange.emit('2024.10.27'); fixture.detectChanges();
    expect(element.textContent).toContain('Няма профили за това търсене.');
    expect(service.getAllData).toHaveBeenCalledOnce();
    expect(service.getSections).not.toHaveBeenCalled();
  });

  it('mounts preferences only when its tab opens and retains the component when returning', async () => {
    const { fixture, component, service, element } = await setup();
    const router = TestBed.inject(Router);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(PreferencesStub))).toBeNull();
    expect(service.getSections).not.toHaveBeenCalled();

    await router.navigate([], { queryParams: { tab: 'preferences' } });
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.preferencesView()).toBe(true);
    const preferences = fixture.debugElement.query(By.directive(PreferencesStub)).componentInstance;
    expect(element.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Преференции');
    expect(element.querySelector<HTMLElement>('section[aria-label="Профили"]')?.hidden).toBe(true);

    await router.navigate([], { queryParams: {} });
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.preferencesView()).toBe(false);
    expect(fixture.debugElement.query(By.directive(PreferencesStub)).componentInstance).toBe(preferences);
    expect(element.querySelector<HTMLElement>('section[aria-label="Преференции"]')?.hidden).toBe(true);
    expect(service.getAllData).toHaveBeenCalledOnce();
  });

  it('reports a summary failure and retries through the visible action', async () => {
    const { fixture, service, summaries, element } = await setup();
    service.getAllData.mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of(summaries));
    await fixture.whenStable(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Профилите не могат да бъдат заредени');
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"] button')).toHaveLength(3);
  });

  it('ignores pending summaries when navigation destroys the directory', async () => {
    const { fixture, component, service, summaries } = await setup();
    const pending = new Subject<Record<string, ContestantSummary>>();
    service.getAllData.mockReturnValueOnce(pending);
    fixture.detectChanges(); fixture.destroy();
    pending.next(summaries); pending.complete();
    await Promise.resolve();
    expect(component.entries()).toEqual([]);
  });
});
