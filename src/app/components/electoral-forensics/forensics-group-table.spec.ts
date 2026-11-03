import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { groupFixture } from './forensics.fixtures';
import { ForensicsGroupTableComponent } from './forensics-group-table';

describe('national district summary', () => {
  it('keeps all 31 districts in one keyboard-scrollable table with sticky headers', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', Array.from({ length: 31 }, (_, i) => groupFixture({ key: String(i + 1), name: `Район ${i + 1}` })));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const scroll = element.querySelector<HTMLElement>('.table-scroll')!;
    expect(element.querySelectorAll('tbody tr').length).toBe(31);
    expect(element.querySelector('.pagination')).toBeNull();
    expect(scroll.tabIndex).toBe(0);
    expect(getComputedStyle(scroll).maxHeight).toBe('400px');
    expect(getComputedStyle(element.querySelector('thead th')!).position).toBe('sticky');
  });

  it('shows both candidate gains and eligible added-voter checks alongside turnout', () => {
    const fixture = TestBed.createComponent(ForensicsGroupTableComponent);
    fixture.componentRef.setInput('rows', [groupFixture({ added1: 5, added2: 9, deltaAdded: 4, addedReviewN: 1,
      candidateTotals: [{ id: '4', name: 'Гюров', votes1: 20, votes2: 50, deltaVotes: 30 },
        { id: '25', name: 'Йотова', votes1: 40, votes2: 90, deltaVotes: 50 }] })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('thead')?.textContent).toContain('Δ Гюров');
    expect(element.querySelector('thead')?.textContent).toContain('Дописани: преглед');
    expect(element.querySelector('tbody')?.textContent).toContain('+30');
    expect(element.querySelector('tbody')?.textContent).toContain('+50');
    expect(element.querySelector('tbody')?.textContent).toContain('5 / 9');
    expect(element.querySelector('caption')?.textContent).toContain('допустимите сравними секции');
  });
});
