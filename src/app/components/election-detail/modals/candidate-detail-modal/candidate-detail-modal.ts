import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { Params } from '@angular/router';
import { RegionCandidate, Section } from '../../../../models/election.models';
import { ContestantDetailModalComponent } from '../../../contestant-detail-modal/contestant-detail-modal';

@Component({
  selector: 'app-candidate-detail-modal',
  standalone: true,
  imports: [ContestantDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './candidate-detail-modal.html',
})
export class CandidateDetailModalComponent {
  @Input() pageQueryParams: Params = {};
  @Input() pageRoute: string[] = [];
  @Input({ required: true }) candidate!: RegionCandidate;
  @Input({ required: true }) sections: Section[] = [];
  @Input() currentDate = '';
  @Output() close = new EventEmitter<void>();
}
