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
});
