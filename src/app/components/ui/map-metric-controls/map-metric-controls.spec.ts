import { SelectComponent } from '../select/select';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { ThemeService } from '../../../services/theme.service';
import { MapActionsComponent } from '../map-actions/map-actions';
import { MapLegendComponent } from '../map-legend/map-legend';
import { MapMetricControlsComponent } from './map-metric-controls';
import { PartyFilterComponent } from '../../election-detail/party-filter/party-filter';

describe('map indicator controls', () => {
  it('shows the current indicator and emits valid dropdown changes', () => {
    TestBed.configureTestingModule({ imports: [MapMetricControlsComponent] });
    const fixture = TestBed.createComponent(MapMetricControlsComponent);
    fixture.componentRef.setInput('metric', 'activity');
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    expect(select.label()).toBe('Показател на картата');
    expect(select.value()).toBe('activity');
    expect(select.options().some(option => option.value === 'summary' && option.icon === 'summary')).toBe(true);
    const changed = vi.fn();
    fixture.componentInstance.metricChange.subscribe(changed);
    select.valueChange.emit('summary');
    expect(changed).toHaveBeenCalledExactlyOnceWith('summary');
    fixture.componentInstance.selectMetric('unknown');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('uses candidate labels and hides parliamentary indicators in presidential elections', () => {
    TestBed.configureTestingModule({ imports: [MapMetricControlsComponent] });
    const fixture = TestBed.createComponent(MapMetricControlsComponent);
    fixture.componentRef.setInput('presidential', true);
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    expect(select.options().find(option => option.value === 'leading-party')?.label).toBe('Кандидати');
    expect(select.options().find(option => option.value === 'party-votes')?.label).toBe('Гласове за кандидат');
    expect(select.options().some(option => option.value === 'leading-preference' || option.value === 'below-threshold')).toBe(false);
    const changed = vi.fn();
    fixture.componentInstance.metricChange.subscribe(changed);
    fixture.componentInstance.selectMetric('leading-preference');
    fixture.componentInstance.selectMetric('below-threshold');
    expect(changed).not.toHaveBeenCalled();
  });

  it('offers a single-party filter only for support and support-change indicators', () => {
    TestBed.configureTestingModule({ imports: [MapMetricControlsComponent] });
    const fixture = TestBed.createComponent(MapMetricControlsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-party-filter')).toBeNull();
    fixture.componentRef.setInput('metric', 'party-votes');
    fixture.componentRef.setInput('selectedPartyId', '7');
    fixture.detectChanges();
    const filter = fixture.debugElement.query(By.directive(PartyFilterComponent)).componentInstance as PartyFilterComponent;
    expect(filter.singleSelect).toBe(true);
    expect(filter.selectedPartyIds).toEqual(new Set(['7']));
    const changed = vi.fn();
    fixture.componentInstance.partyChange.subscribe(changed);
    filter.selectedPartyIdsChange.emit(new Set());
    filter.selectedPartyIdsChange.emit(new Set(['9']));
    expect(changed).toHaveBeenCalledExactlyOnceWith('9');
    fixture.componentRef.setInput('metric', 'party-change'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-party-filter')).not.toBeNull();
    fixture.componentRef.setInput('metric', 'activity'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-party-filter')).toBeNull();
  });

  it('keeps export and fullscreen icon-only with accessible labels and titles', () => {
    TestBed.configureTestingModule({ imports: [MapActionsComponent] });
    const fixture = TestBed.createComponent(MapActionsComponent);
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.textContent?.trim()).toBe('');
      expect(button.getAttribute('aria-label')).toBe(button.title);
      expect(button.querySelector('svg')).not.toBeNull();
    }
    const exportClick = vi.fn();
    fixture.componentInstance.exportClick.subscribe(exportClick);
    buttons[0].click();
    expect(exportClick).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('exporting', true);
    fixture.detectChanges();
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[0].getAttribute('aria-busy')).toBe('true');
  });

  it('opens the legend by default', () => {
    TestBed.configureTestingModule({
      imports: [MapLegendComponent],
      providers: [{ provide: ThemeService, useValue: { darkMode: () => false } }],
    });
    const fixture = TestBed.createComponent(MapLegendComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  });
});
