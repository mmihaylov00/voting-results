import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RiskContext } from '../../../utils/risk-message.util';
import { RiskBadgeComponent, RiskIndicator } from './risk-badge';

@Component({
  imports: [RiskBadgeComponent],
  template: '<div (click)="openRow()"><app-risk-badge [risk]="risk" [context]="context" /></div>',
})
class BadgeHost {
  risk: RiskIndicator = { code: 'R1.1' };
  context?: RiskContext;
  openRow = vi.fn();
}

describe('RiskBadgeComponent explanations', () => {
  let fixture: ComponentFixture<BadgeHost>;
  afterEach(() => fixture?.destroy());

  function render(risk: RiskIndicator = { code: 'R1.1' }, dialog = false, context?: RiskContext): HTMLButtonElement {
    TestBed.configureTestingModule({ imports: [BadgeHost] });
    if (dialog) TestBed.overrideComponent(BadgeHost, {
      set: { template: '<dialog open><app-risk-badge [risk]="risk" [context]="context" /></dialog>' },
    });
    fixture = TestBed.createComponent(BadgeHost);
    fixture.componentInstance.risk = risk;
    fixture.componentInstance.context = context;
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('app-risk-badge button');
  }

  it.each([undefined, {}])('explains historical codes without inventing measurements for details %j', details => {
    const button = render({ code: 'R1.1', details });
    button.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain('Активността се променя необичайно силно');
    expect(tooltip.textContent).not.toContain('0.0');
    expect(button.getAttribute('aria-label')).toContain('R1.1: Активността');
    expect(button.classList.contains('bg-muted')).toBe(true);
    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('keeps the observed values alongside the code explanation', () => {
    const button = render({ code: 'R1.1', severity: 'high', details: { turnoutChange: 0.25, stdDevs: 2.5 } });
    button.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain('типичната промяна в района');
    expect(tooltip.textContent).toContain('25.0%');
    expect(tooltip.textContent).toContain('2.5σ');
    expect(button.classList.contains('text-red-600')).toBe(true);
  });

  it('supports keyboard focus, Escape and tapping without opening the enclosing row', () => {
    const button = render();
    button.focus();
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))).toBe(false);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))).toBe(true);
    button.click();
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(fixture.componentInstance.openRow).not.toHaveBeenCalled();
    button.blur();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('keeps modal explanations in the dialog and treats party names as text', () => {
    const button = render({ code: 'R1.2', details: { partyId: '2', captureRatio: 0.8 } }, true,
      { partiesById: { '2': '<img src=x> & партия' } });
    button.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = fixture.nativeElement.querySelector('dialog [role="tooltip"]')!;
    expect(tooltip.textContent).toContain('<img src=x> & партия');
    expect(tooltip.querySelector('img')).toBeNull();
    fixture.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('handles an unknown code without assigning it a known explanation', () => {
    const button = render({ code: 'R9.9' });
    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Няма налично описание за този рисков индикатор.');
    expect(button.textContent?.trim()).toBe('R9.9');
  });
});
