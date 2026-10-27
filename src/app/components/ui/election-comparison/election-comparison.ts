import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, contentChild, effect, inject, input, model, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Section } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { HeadToHeadComponent } from '../../head-to-head/head-to-head';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';

@Component({
  selector: 'app-election-comparison',
  standalone: true,
  imports: [HeadToHeadComponent, HlmButtonDirective, NgTemplateOutlet],
  template: `
    @if (active()) {
      <nav aria-label="Вид сравнение" class="app-tabs mb-6 flex flex-wrap gap-1 border-b border-border">
        <button hlmBtn variant="line" type="button" [attr.data-state]="mode() === 'elections' ? 'active' : 'inactive'" [attr.aria-pressed]="mode() === 'elections'" (click)="selectMode('elections')">Между избори</button>
        @if (presidential) {
          <button hlmBtn variant="line" type="button" [attr.data-state]="mode() === 'parties' ? 'active' : 'inactive'" [attr.aria-pressed]="mode() === 'parties'" (click)="selectMode('parties')">Между кандидати</button>
        } @else {
          <button hlmBtn variant="line" type="button" [attr.data-state]="mode() === 'parties' && participantMode() === 'parties' ? 'active' : 'inactive'" [attr.aria-pressed]="mode() === 'parties' && participantMode() === 'parties'" (click)="selectMode('parties')">Между партии</button>
          <button hlmBtn variant="line" type="button" [attr.data-state]="mode() === 'parties' && participantMode() === 'candidates' ? 'active' : 'inactive'" [attr.aria-pressed]="mode() === 'parties' && participantMode() === 'candidates'" (click)="selectMode('candidates')">Между кандидати</button>
        }
      </nav>
    }
    @if (analysisVisited()) {
      <div [hidden]="participantsVisible()"><ng-container [ngTemplateOutlet]="analysisTemplate() ?? null" /></div>
    }
    <div [hidden]="!participantsVisible()">
      @defer (when participantsVisible()) { <app-head-to-head [scope]="sections()" [embedded]="true" /> }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElectionComparisonComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly presidential = inject(ElectionService).electionType === 'presidential';
  readonly participantMode = toSignal(this.route.queryParamMap.pipe(
    map(params => !this.presidential && params.get('mode') === 'candidates' ? 'candidates' : 'parties'),
  ), { initialValue: 'parties' as const });
  readonly active = input(false);
  readonly sections = input<Section[] | null>(null);
  readonly mode = model<'elections' | 'parties'>('elections');
  readonly showAnalysis = input(false);
  readonly analysisTemplate = contentChild(TemplateRef);
  readonly analysisVisited = signal(false);
  readonly participantsVisible = computed(() => this.active() && this.mode() === 'parties');

  constructor() {
    effect(() => { if (this.showAnalysis()) this.analysisVisited.set(true); });
  }

  selectMode(mode: 'elections' | 'parties' | 'candidates'): void {
    this.mode.set(mode === 'elections' ? mode : 'parties');
    const queryParams = mode === 'elections' ? { comparison: null } : {
      comparison: 'parties', mode: mode === 'candidates' && !this.presidential ? 'candidates' : null,
      ...(!this.presidential && mode !== this.participantMode() ? { left: null, right: null } : {}),
    };
    void this.router.navigate([], { relativeTo: this.route,
      queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
