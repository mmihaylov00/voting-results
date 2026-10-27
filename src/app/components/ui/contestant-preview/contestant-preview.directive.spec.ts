import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegionCandidate } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { ContestantPreviewDirective } from './contestant-preview.directive';

const triggerTemplate = `
  @if (visible()) {
    <button id="preview-trigger" type="button" aria-describedby="existing-help"
      [appContestantPreview]="name()" contestantPreviewDate="2026.04.19" [contestantPreviewPartyId]="partyId()"
      [contestantPreviewCandidate]="candidate()" contestantPreviewRegion="01">{{ name() }}</button>
    <button id="second-trigger" type="button" [appContestantPreview]="name()"
      contestantPreviewDate="2026.04.19" contestantPreviewPartyId="1">Втори профил</button>
  }
`;

@Component({ imports: [ContestantPreviewDirective], template: triggerTemplate })
class PreviewHostComponent {
  readonly name = signal('ГЕРБ');
  readonly partyId = signal('1');
  readonly candidate = signal<RegionCandidate | null>(null);
  readonly visible = signal(true);
}

const summary = {
  '2026.04.19': { parties: { '1': 'ГЕРБ-СДС', '2': 'Друга партия' }, regions: [
    { id: '01', name: 'Първи район', total: 120, voted: 100, partyVotes: { '1': 60, '2': 40 } },
  ] },
};

describe('ContestantPreviewDirective', () => {
  let fixture: ComponentFixture<PreviewHostComponent>;
  let getAllData: ReturnType<typeof vi.fn>;

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(dialog = false): HTMLButtonElement {
    getAllData = vi.fn(() => of(summary));
    TestBed.configureTestingModule({
      imports: [PreviewHostComponent],
      providers: [{ provide: ElectionService, useValue: {
        electionType: 'governmental', getAllData,
        getDates: () => [{ date: '2026.04.19', name: 'Април 2026', type: 'governmental' }],
      } }],
    });
    if (dialog) TestBed.overrideComponent(PreviewHostComponent, { set: { template: `<dialog open>${triggerTemplate}</dialog>` } });
    fixture = TestBed.createComponent(PreviewHostComponent);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('#preview-trigger');
  }

  function tooltip(): HTMLElement | null { return document.querySelector('[role="tooltip"]'); }

  async function show(trigger: HTMLElement, event = 'mouseenter'): Promise<HTMLElement> {
    if (event === 'focusin') trigger.focus();
    else trigger.dispatchEvent(new MouseEvent(event));
    await vi.advanceTimersByTimeAsync(200);
    TestBed.tick();
    expect(tooltip()).not.toBeNull();
    return tooltip()!;
  }

  it('loads archive summaries only after the hover delay and preserves existing descriptions', async () => {
    const trigger = setup();
    expect(getAllData).not.toHaveBeenCalled();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(199);
    expect(getAllData).not.toHaveBeenCalled();
    expect(tooltip()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    TestBed.tick();
    const preview = tooltip()!;
    expect(getAllData).toHaveBeenCalledOnce();
    expect(preview.parentElement).toBe(document.body);
    expect(preview.textContent).toContain('ГЕРБ');
    expect(preview.textContent).toContain('Април 2026');
    expect(preview.textContent).toContain('60');
    expect(preview.textContent).toContain('Кликнете за повече информация');
    expect(trigger.getAttribute('aria-describedby')?.split(/\s+/)).toEqual(['existing-help', preview.id]);
    trigger.click();
    expect(tooltip()).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBe('existing-help');
  });

  it('does not load or open after a brief hover ends before the delay', async () => {
    const trigger = setup();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(100);
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(500);
    expect(getAllData).not.toHaveBeenCalled();
    expect(tooltip()).toBeNull();
  });

  it('keeps the preview open when moving the pointer onto it', async () => {
    const trigger = setup();
    const preview = await show(trigger);
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    preview.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(500);
    expect(tooltip()).toBe(preview);
    preview.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(500);
    expect(tooltip()).toBeNull();
  });

  it('opens on keyboard focus and consumes Escape only while a preview is active', async () => {
    const trigger = setup();
    await show(trigger, 'focusin');
    const parentEscape = vi.fn();
    fixture.nativeElement.addEventListener('keydown', parentEscape);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    trigger.dispatchEvent(escape);
    expect(tooltip()).toBeNull();
    expect(parentEscape).not.toHaveBeenCalled();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(parentEscape).toHaveBeenCalledOnce();
  });

  it('places previews inside the closest native dialog and assigns unique accessible IDs', async () => {
    const trigger = setup(true);
    const first = await show(trigger);
    expect(first.closest('dialog')).toBe(trigger.closest('dialog'));
    const firstId = first.id;
    trigger.click();
    const secondTrigger = fixture.nativeElement.querySelector('#second-trigger') as HTMLButtonElement;
    const second = await show(secondTrigger);
    expect(second.id).not.toBe(firstId);
    expect(secondTrigger.getAttribute('aria-describedby')).toBe(second.id);
    secondTrigger.click();
    expect(secondTrigger.hasAttribute('aria-describedby')).toBe(false);
  });

  it('uses supplied preference results without loading archive history', async () => {
    const trigger = setup();
    fixture.componentInstance.name.set('Иван Иванов');
    fixture.componentInstance.candidate.set({
      candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'ГЕРБ',
      total: 12, paper: 7, machine: 5, totalInRegion: 12, partyPercentInRegion: 60,
      preferencePercentOfPartyVotes: 20,
    });
    fixture.detectChanges();
    const preview = await show(trigger);
    expect(getAllData).not.toHaveBeenCalled();
    expect(preview.textContent).toContain('Иван Иванов');
    expect(preview.textContent).toContain('12');
    expect(preview.textContent?.toLocaleLowerCase('bg')).toContain('преференци');
  });

  it('does not interpret names as HTML', async () => {
    const trigger = setup();
    const name = '<img src=x onerror="alert(1)">';
    fixture.componentInstance.name.set(name);
    getAllData.mockReturnValue(of({ '2026.04.19': { ...summary['2026.04.19'], parties: { '1': name } } }));
    fixture.detectChanges();
    const preview = await show(trigger);
    expect(preview.textContent).toContain(name);
    expect(preview.querySelector('[onerror]')).toBeNull();
    expect(preview.querySelector('img[src="x"]')).toBeNull();
  });

  it('keeps the identity and click prompt available when result loading fails', async () => {
    const trigger = setup();
    getAllData.mockReturnValue(throwError(() => new Error('offline')));
    const preview = await show(trigger);
    expect(preview.textContent).toContain('ГЕРБ');
    expect(preview.textContent).toContain('Резултатите не могат да бъдат заредени.');
    expect(preview.textContent).toContain('Кликнете за повече информация');
    expect(preview.querySelector('[role="status"]')).toBeNull();
  });

  it('does not reopen a dismissed preview when a pending archive request completes', async () => {
    const trigger = setup();
    const pending = new Subject<typeof summary>();
    getAllData.mockReturnValue(pending);
    await show(trigger);
    trigger.click();
    pending.next(summary);
    pending.complete();
    await Promise.resolve();
    TestBed.tick();
    expect(tooltip()).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBe('existing-help');
  });

  it('keeps the new identity when an earlier hover request resolves later', async () => {
    const trigger = setup();
    const pending = new Subject<typeof summary>();
    getAllData.mockReturnValueOnce(pending);
    await show(trigger);
    fixture.componentInstance.name.set('Друга партия');
    fixture.componentInstance.partyId.set('2');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.tick();
    const current = tooltip()!;
    expect(current.textContent).toContain('Друга партия');
    expect(current.textContent).toContain('40');
    pending.next(summary);
    pending.complete();
    await Promise.resolve();
    TestBed.tick();
    expect(tooltip()).toBe(current);
    expect(current.textContent).toContain('Друга партия');
    expect(current.textContent).toContain('40');
  });

  it('positions the preview within the viewport near the bottom-right corner', async () => {
    const trigger = setup();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this === trigger ? new DOMRect(window.innerWidth - 40, window.innerHeight - 24, 32, 16)
        : new DOMRect(0, 0, 320, 220);
    });
    const preview = await show(trigger);
    const left = Number.parseFloat(preview.style.left);
    const top = Number.parseFloat(preview.style.top);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left + 320).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(top + 220).toBeLessThanOrEqual(window.innerHeight - 8);
  });

  it('closes on blur, scroll and resize and cancels delayed previews on destruction', async () => {
    const trigger = setup();
    await show(trigger, 'focusin');
    trigger.blur();
    await vi.advanceTimersByTimeAsync(500);
    expect(tooltip()).toBeNull();
    const scrollable = await show(trigger);
    scrollable.dispatchEvent(new Event('scroll'));
    expect(tooltip()).toBe(scrollable);
    window.dispatchEvent(new Event('scroll'));
    expect(tooltip()).toBeNull();
    await show(trigger);
    window.dispatchEvent(new Event('resize'));
    expect(tooltip()).toBeNull();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.componentInstance.visible.set(false);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(tooltip()).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBe('existing-help');
  });
});
