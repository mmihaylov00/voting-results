import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { groupFixture } from './forensics.fixtures';
import { ForensicsGroupTableComponent } from './forensics-group-table';
import { TableControlsComponent } from '../ui/table-controls/table-controls';
import { ForensicsGroup } from './forensics.models';

describe('national district summary', () => {
  it('keeps all 31 districts in one keyboard-scrollable table with sticky headers', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', Array.from({ length: 31 }, (_, i) => groupFixture({ key: String(i + 1), name: `Район ${i + 1}` })));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const scroll = element.querySelector<HTMLElement>('.table-scroll')!;
    expect(element.querySelectorAll('tbody tr').length).toBe(31);
    expect(element.querySelectorAll('thead th').length).toBe(7);
    expect(element.querySelector('.pagination')).toBeNull();
    expect(scroll.tabIndex).toBe(0);
    expect(getComputedStyle(scroll).maxHeight).toBe('400px');
    expect(getComputedStyle(element.querySelector('thead th')!).position).toBe('sticky');
    expect(getComputedStyle(element.querySelector('tbody th')!).position).toBe('sticky');
    expect(getComputedStyle(element.querySelector('tbody th')!).left).toBe('0px');
  });

  it('keeps candidate gains visible and reveals all baseline and added-voter metrics on demand', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', [groupFixture({ added1: 5, added2: 9, deltaAdded: 4, addedReviewN: 1,
      candidateTotals: [{ id: '4', name: 'Гюров', votes1: 20, votes2: 50, deltaVotes: 30 },
        { id: '25', name: 'Йотова', votes1: 40, votes2: 90, deltaVotes: 50 }] })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('thead')?.textContent).toContain('Δ Гюров');
    expect(element.querySelector('thead')?.textContent).not.toContain('Дописани: преглед');
    expect(element.querySelector('tbody')?.textContent).toContain('+30');
    expect(element.querySelector('tbody')?.textContent).toContain('+50');
    expect(element.querySelector('caption')?.textContent).toContain('допустимите сравними секции');
    const toggle = element.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelectorAll('thead th').length).toBe(15);
    expect(element.querySelector('thead')?.textContent).toContain('Дописани: преглед');
    expect(element.querySelector('tbody')?.textContent).toContain('5 / 9');
    expect(element.querySelector('tbody')?.textContent).toContain('250 / 250');
    expect(element.querySelector('tbody')?.textContent).toContain('20 → 50');
    expect(element.querySelector('tbody')?.textContent).toContain('40 → 90');
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('thead th').length).toBe(7);
  });

  it('sorts candidate gains numerically in both directions and leaves missing gains last', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', [
      groupFixture({ key: '1', name: 'Малък ръст', candidateTotals: [{ id: '25', name: 'Йотова', votes1: 10, votes2: 12, deltaVotes: 2 }] }),
      groupFixture({ key: '2', name: 'Без данни' }),
      groupFixture({ key: '3', name: 'Голям ръст', candidateTotals: [{ id: '25', name: 'Йотова', votes1: 10, votes2: 30, deltaVotes: 20 }] }),
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('th[columnKey="yotova"]')!;
    header.click();
    fixture.detectChanges();
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(fixture.componentInstance.visible().map(row => row.key)).toEqual(['3', '1', '2']);
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(fixture.componentInstance.visible().map(row => row.key)).toEqual(['1', '3', '2']);
  });

  it.each(['registered1', 'meanDeltaPp', 'deltaAdded'])
    ('returns a hidden %s sort to visible turnout-change sorting when details close', column => {
      const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
      fixture.componentRef.setInput('rows', [
        groupFixture({ key: '1', name: 'Повече по скрития показател', registered1: 1000,
          meanDeltaPp: 10, deltaAdded: 20, deltaTurnoutPp: 1 }),
        groupFixture({ key: '2', name: 'По-голяма промяна на активността', registered1: 100,
          meanDeltaPp: 1, deltaAdded: 1, deltaTurnoutPp: 20 }),
      ]);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const toggle = element.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
      toggle.click();
      fixture.detectChanges();
      element.querySelector<HTMLElement>(`th[columnKey="${column}"]`)!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.visible().map(row => row.key)).toEqual(['1', '2']);
      toggle.click();
      fixture.detectChanges();
      expect(element.querySelector(`th[columnKey="${column}"]`)).toBeNull();
      expect(element.querySelector('th[columnKey="deltaTurnoutPp"]')?.getAttribute('aria-sort')).toBe('descending');
      expect(fixture.componentInstance.visible().map(row => row.key)).toEqual(['2', '1']);
      expect(fixture.componentInstance.page()).toBe(0);
    });

  it('resets pagination for search, numeric sorting and a replacement dataset', async () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', Array.from({ length: 60 }, (_, index) => groupFixture({
      key: String(index), name: index === 59 ? 'Търсено място' : `Район ${index}`, eligibleN: index + 1,
      n: index + 1, deltaTurnoutPp: index,
    })));
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.page.set(1);
    fixture.detectChanges();
    expect(component.visible()).toHaveLength(10);
    (fixture.nativeElement.querySelector('th[columnKey="deltaTurnoutPp"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.page()).toBe(0);
    expect(component.visible()[0].deltaTurnoutPp).toBe(59);
    component.page.set(1);
    fixture.detectChanges();
    const controls = fixture.debugElement.query(By.directive(TableControlsComponent)).componentInstance as TableControlsComponent<ForensicsGroup>;
    controls.query.set('Търсено');
    fixture.detectChanges();
    expect(component.page()).toBe(0);
    expect(component.visible().map(row => row.name)).toEqual(['Търсено място']);
    controls.query.set('');
    fixture.detectChanges();
    component.page.set(1);
    fixture.componentRef.setInput('rows', [groupFixture({ name: 'Нова извадка' })]);
    fixture.detectChanges();
    expect(component.page()).toBe(0);
    expect(component.visible()[0].name).toBe('Нова извадка');
  });

  it('preserves unavailable candidate, added-elector and method values instead of displaying zero', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', [groupFixture()]);
    fixture.componentInstance.showDetails.set(true);
    fixture.detectChanges();
    const cells = fixture.nativeElement.querySelectorAll('tbody td') as NodeListOf<HTMLTableCellElement>;
    expect(cells[3].textContent).toContain('няма данни');
    expect(cells[4].textContent).toContain('няма данни');
    expect(cells[10].textContent).toContain('няма данни / няма данни');
    expect(cells[12].textContent).toContain('няма данни / няма данни / няма данни');
  });
});
