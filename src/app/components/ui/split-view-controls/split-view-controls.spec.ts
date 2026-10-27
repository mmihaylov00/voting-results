import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ElectionService } from '../../../services/election';
import { ThemeService } from '../../../services/theme.service';
import { ElectionDetailComponent } from '../../election-detail/election-detail';
import { RegionListComponent } from '../../region-list/region-list';
import { AbroadMapComponent } from '../abroad-map/abroad-map';
import { SettlementMapComponent } from '../settlement-map/settlement-map';

for (const page of [RegionListComponent, ElectionDetailComponent]) {
  describe(`${page.name} split workspace`, () => {
    let resize: (matches: boolean) => void;
    const getSections = vi.fn(() => of([]));

    beforeEach(async () => {
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      resize = matches => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent));
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      }));
      getSections.mockClear();
      await TestBed.configureTestingModule({
        imports: [page],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: {
            params: of({ date: '' }), paramMap: of(convertToParamMap({})), data: of({}),
            queryParams: of({}), queryParamMap: of(convertToParamMap({})),
            snapshot: { paramMap: convertToParamMap({}) },
          } },
          { provide: ThemeService, useValue: { darkMode: () => false } },
          { provide: ElectionService, useValue: {
            electionType: 'governmental', loading$: of(false), getDates: () => [],
            getDateName: () => '', getOfficialNationalElectors: () => null,
            getRegions: () => of([]), getParties: () => of({}), getAllFullData: () => of({}),
            getSections,
          } },
        ],
      }).overrideComponent(page, {
        remove: { imports: [SettlementMapComponent, AbroadMapComponent] },
        add: { schemas: [NO_ERRORS_SCHEMA] },
      }).compileComponents();
    });

    afterEach(() => vi.unstubAllGlobals());

    it('expands either side, restores the split and preserves mounted content without reloading', async () => {
      const fixture = TestBed.createComponent<RegionListComponent | ElectionDetailComponent>(page);
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await fixture.whenStable();
      const component = fixture.componentInstance;
      component.searchTerm = 'Запазен филтър';
      fixture.changeDetectorRef.markForCheck();
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const workspace = root.querySelector('[data-map-workspace]')!;
      const list = workspace.querySelector(':scope > section')!;
      const map = workspace.querySelector(':scope > aside')!;
      const mapElement = map.querySelector('app-settlement-map');
      const search = list.querySelector<HTMLInputElement>('app-search-filter input');
      const scope = component.analysisSections;
      const mapData = component.settlementMapData;
      const controls = root.querySelector('app-split-view-controls')!;
      const control = (label: string) => controls.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
      const splitClass = 'map-workspace-split';

      expect(workspace.classList.contains(splitClass)).toBe(true);
      expect(workspace.getAttribute('data-layout')).toBe('split');
      expect(mapElement).not.toBeNull();
      expect(controls.previousElementSibling).toBe(list);
      expect(controls.nextElementSibling).toBe(map);
      expect(controls.textContent?.trim()).toBe('');
      control('Скрий списъка').click();
      await fixture.whenStable();
      expect(component.workspaceLayout()).toBe('map');
      expect(list.classList.contains('hidden')).toBe(true);
      expect(map.classList.contains('hidden')).toBe(false);
      expect(workspace.classList.contains(splitClass)).toBe(true);
      expect(workspace.getAttribute('data-layout')).toBe('map');
      expect(list.hasAttribute('inert')).toBe(true);
      expect(map.hasAttribute('inert')).toBe(false);
      expect(control('Покажи списъка').getAttribute('aria-expanded')).toBe('false');
      expect(controls.querySelectorAll('button')).toHaveLength(1);

      control('Покажи списъка').click();
      await fixture.whenStable();
      expect(workspace.classList.contains(splitClass)).toBe(true);
      control('Скрий картата').click();
      await fixture.whenStable();
      expect(component.workspaceLayout()).toBe('list');
      expect(list.classList.contains('hidden')).toBe(false);
      expect(map.classList.contains('hidden')).toBe(true);
      expect(workspace.classList.contains(splitClass)).toBe(true);
      expect(workspace.getAttribute('data-layout')).toBe('list');
      expect(map.hasAttribute('inert')).toBe(true);
      expect(list.hasAttribute('inert')).toBe(false);
      expect(control('Покажи картата').getAttribute('aria-expanded')).toBe('false');
      expect(controls.querySelectorAll('button')).toHaveLength(1);

      control('Покажи картата').click();
      await fixture.whenStable();
      expect(workspace.classList.contains(splitClass)).toBe(true);
      expect(list.classList.contains('hidden')).toBe(false);
      expect(map.classList.contains('hidden')).toBe(false);
      expect(list.hasAttribute('inert')).toBe(false);
      expect(map.hasAttribute('inert')).toBe(false);
      expect(map.querySelector('app-settlement-map')).toBe(mapElement);
      expect(list.querySelector('app-search-filter input')).toBe(search);
      expect(search?.value).toBe('Запазен филтър');
      expect(component.analysisSections).toBe(scope);
      expect(component.settlementMapData).toBe(mapData);
      expect(getSections).not.toHaveBeenCalled();

      control('Скрий списъка').click();
      component.setLeftPanel('stats');
      await fixture.whenStable();
      expect(list.classList.contains('hidden')).toBe(false);
      expect(map.classList.contains('hidden')).toBe(true);
      expect(controls.classList.contains('lg:block')).toBe(false);
      expect(workspace.classList.contains(splitClass)).toBe(false);
      expect(list.hasAttribute('inert')).toBe(false);

      if (component instanceof RegionListComponent) component.selectContentTab('cards');
      else component.selectContentTab('sections');
      await fixture.whenStable();
      expect(component.workspaceLayout()).toBe('split');
      control('Скрий картата').click();
      await fixture.whenStable();
      if (component instanceof RegionListComponent) component.focusAnalysisRegion('23');
      else component.setViewMode('map');
      await fixture.whenStable();
      expect(component.workspaceLayout()).toBe('split');
      expect(map.classList.contains('hidden')).toBe(false);
    });

    it('keeps mobile list/map navigation independent of the desktop panel choice', async () => {
      const fixture = TestBed.createComponent<RegionListComponent | ElectionDetailComponent>(page);
      await fixture.whenStable();
      const component = fixture.componentInstance;
      component.workspaceLayout.set('map');
      resize(false);
      await fixture.whenStable();
      const workspace = fixture.nativeElement.querySelector('[data-map-workspace]') as HTMLElement;
      expect(workspace.querySelector(':scope > section')!.classList.contains('hidden')).toBe(false);
      expect(workspace.querySelector(':scope > aside')!.classList.contains('hidden')).toBe(true);
      expect(workspace.querySelector(':scope > section')!.hasAttribute('inert')).toBe(false);
      if (component instanceof RegionListComponent) component.setOverviewMode('map');
      else component.setViewMode('map');
      await fixture.whenStable();
      expect(workspace.querySelector(':scope > aside')!.classList.contains('hidden')).toBe(false);
    });
  });
}
