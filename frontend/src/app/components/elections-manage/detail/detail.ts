import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { APP_ROLE } from '@votes/shared';
import { AuthService } from '../../../services/auth.service';
import { ElectionsManageService, ElectionManageDto } from '../../../services/elections-manage.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';

@Component({
  selector: 'app-elections-manage-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
  ],
  templateUrl: './detail.html',
})
export class ElectionsManageDetailComponent {
  electionId: string | null = null;
  election = signal<ElectionManageDto | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private route: ActivatedRoute,
    private electionsManageService: ElectionsManageService,
    private authService: AuthService,
  ) {
    this.electionId = this.route.snapshot.paramMap.get('id');
    if (this.electionId) {
      this.load();
    }
  }

  isAdmin(): boolean {
    return this.authService.hasRole(APP_ROLE.ADMIN);
  }

  load() {
    if (!this.electionId) return;
    this.electionsManageService.get(this.electionId).subscribe((data) => {
      this.election.set(data);
    });
  }

  remove() {
    if (!this.isAdmin()) {
      return;
    }

    if (!this.electionId) return;
    if (!confirm('Сигурни ли сте, че искате да изтриете кампанията?')) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.electionsManageService.remove(this.electionId).subscribe({
      next: () => {
        this.loading.set(false);
        window.history.back();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Неуспешно изтриване.');
        this.loading.set(false);
      },
    });
  }
}
