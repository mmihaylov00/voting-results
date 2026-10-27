import { LoadingBarComponent } from '../loading-bar/loading-bar';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RegionCandidate } from '../../../models/election.models';
import { ContestantParticipation } from '../../../utils/contestant-profile.util';
import { getContestantImage } from '../../../utils/contestant-image.util';
import { getPresidentialCandidateName } from '../../../utils/candidate-label';
import { ElectionType } from '../../../utils/election-type';
import { getPartyDisplayName } from '../../../utils/party-colors';
import { getDateName } from '../../../utils/date-name.util';

@Component({
  selector: 'app-contestant-preview',
  standalone: true,
  imports: [LoadingBarComponent, CommonModule],
  host: { role: 'tooltip' },
  template: `
    <div class="identity">
      @if (image; as avatar) {
        @if (failedImage !== avatar.src) {
          <img [src]="avatar.src" alt="" width="56" height="56" decoding="async"
            [class.logo]="!candidate && type === 'governmental'" (error)="failedImage = avatar.src" />
        } @else { <span class="initials" aria-hidden="true">{{ initials }}</span> }
      } @else { <span class="initials" aria-hidden="true">{{ initials }}</span> }
      <div class="identity-text"><p class="name">{{ displayName }}</p><p class="kind">{{ kind }}</p></div>
    </div>
    @if (candidate; as person) {
      <p class="full-name">{{ partyLabel(person.partyName) }}</p>
      <p class="scope">{{ region || 'Текущ обхват' }}{{ date ? ' · ' + dateLabel(date) : '' }}</p>
      <dl class="results">
        <div><dt>Преференции</dt><dd>{{ person.total | number }}</dd></div>
        <div><dt>Хартиени</dt><dd>{{ person.paper | number }}</dd></div>
        <div><dt>Машинни</dt><dd>{{ person.machine | number }}</dd></div>
      </dl>
    } @else {
      @if (name !== displayName) { <p class="full-name">{{ name }}</p> }
      <app-loading-bar [loading]="loading" label="Зареждане на резултатите" class="my-3" />
      @if (!loading && (error)) { <p class="scope">Резултатите не могат да бъдат заредени.</p> }
      @else if (!loading) {
        <p class="scope">{{ participations.length }} {{ type === 'presidential' ? 'участия / турове' : 'участия' }} в архива</p>
        @if (result; as election) {
          <p class="scope">Национален резултат · {{ election.name }}</p>
          @if (election.provisional) { <p class="scope">Предварителни · {{ election.provisional.processedPercent }}% обработени секции</p> }
          <dl class="results">
            <div><dt>Гласове</dt><dd>{{ election.votes | number }}</dd></div>
            <div><dt>От гласувалите</dt><dd>{{ election.share === null ? '-' : (election.share | number:'1.2-2') + '%' }}</dd></div>
            <div><dt>Място</dt><dd>{{ election.rank }}</dd></div>
          </dl>
        } @else { <p class="scope">Няма еднозначно съпоставено участие в архива.</p> }
      }
    }
    <p class="prompt"><span aria-hidden="true">↗</span> Кликнете за повече информация</p>
  `,
  styles: `
    :host { position: fixed; z-index: 2000; display: block; box-sizing: border-box; width: 320px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; padding: 1rem; border: 1px solid hsl(var(--border)); border-radius: .5rem; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); box-shadow: 0 8px 28px #0003; font-size: .8125rem; line-height: 1.4; pointer-events: auto; animation: preview-in .12s ease-out; }
    .identity { display: flex; align-items: center; gap: .75rem; }
    .identity img, .initials { width: 56px; height: 56px; flex-shrink: 0; border-radius: .375rem; object-fit: cover; object-position: center 20%; }
    .identity img.logo { padding: .25rem; object-fit: contain; background: white; }
    .initials { display: grid; place-items: center; background: hsl(var(--muted)); font-size: 1.125rem; font-weight: 600; }
    .identity-text { min-width: 0; }
    p { margin: 0; }
    .name { font-size: .9375rem; font-weight: 600; overflow-wrap: anywhere; }
    .kind, .scope, dt { color: hsl(var(--muted-foreground)); font-size: .75rem; }
    .full-name { margin-top: .75rem; overflow-wrap: anywhere; }
    .scope { margin-top: .5rem; }
    .results { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; margin: .75rem 0 0; }
    dd { margin: .125rem 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .prompt { margin-top: .875rem; padding-top: .625rem; border-top: 1px solid hsl(var(--border)); font-size: .75rem; font-weight: 500; }
    @keyframes preview-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { :host { animation: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContestantPreviewComponent {
  @Input() name = '';
  @Input() type: ElectionType = 'governmental';
  @Input() date = '';
  @Input() candidate: RegionCandidate | null = null;
  @Input() region = '';
  @Input() participations: ContestantParticipation[] = [];
  @Input() loading = false;
  @Input() error = false;
  failedImage = '';
  readonly partyLabel = getPartyDisplayName;
  readonly dateLabel = getDateName;

  get displayName(): string {
    return this.candidate ? this.candidate.candidateName
      : this.type === 'presidential' ? getPresidentialCandidateName(this.name) : getPartyDisplayName(this.name);
  }
  get kind(): string {
    return this.candidate ? 'Кандидат за народен представител'
      : this.type === 'presidential' ? 'Президентски кандидат' : 'Партия / коалиция';
  }
  get image() { return getContestantImage(this.candidate?.candidateName ?? this.name, this.candidate ? 'presidential' : this.type); }
  get initials(): string {
    const words = this.displayName.trim().split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toLocaleUpperCase('bg');
  }
  get result(): ContestantParticipation | null {
    return this.participations.find(election => election.date === this.date) ?? this.participations[0] ?? null;
  }
}
