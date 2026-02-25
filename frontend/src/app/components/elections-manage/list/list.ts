import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { APP_ROLE } from '@votes/shared';
import { AuthService } from '../../../services/auth.service';
import { ElectionsManageService, ElectionManageDto } from '../../../services/elections-manage.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import { BaseModalComponent } from '../../ui/base-modal/base-modal';

@Component({
  selector: 'app-elections-manage-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    BaseModalComponent,
  ],
  templateUrl: './list.html',
})
export class ElectionsManageListComponent {
  elections = signal<ElectionManageDto[]>([]);
  error = signal<string | null>(null);
  loading = signal(false);

  createModalOpen = signal(false);
  createError = signal<string | null>(null);
  form = { date: '' };

  constructor(
    private readonly electionsManageService: ElectionsManageService,
    private readonly authService: AuthService,
  ) {
    this.load();
  }

  isAdmin(): boolean {
    return this.authService.hasRole(APP_ROLE.ADMIN);
  }

  load() {
    this.loading.set(true);
    this.electionsManageService.list().subscribe({
      next: (data) => {
        this.elections.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load elections');
        this.loading.set(false);
      },
    });
  }

  create() {
    this.createError.set(null);
    this.loading.set(true);
    const formattedDate = this.toApiDate(this.form.date);
    if (!formattedDate) {
      this.createError.set('Изберете валидна дата.');
      this.loading.set(false);
      return;
    }

    this.electionsManageService.create({ date: formattedDate }).subscribe({
      next: (createdElection) => {
        this.elections.update((current) => this.insertElection(current, createdElection));
        this.form = { date: '' };
        this.createModalOpen.set(false);
        this.loading.set(false);
      },
      error: (err) => {
        this.createError.set(err?.error?.message || 'Failed to create election');
        this.loading.set(false);
      },
    });
  }

  openCreateModal() {
    this.createError.set(null);
    this.form = { date: '' };
    this.createModalOpen.set(true);
  }

  closeCreateModal() {
    this.createModalOpen.set(false);
  }

  canSubmitCreate(): boolean {
    return !!this.toApiDate(this.form.date);
  }

  remove(id: string) {
    if (!this.isAdmin()) {
      return;
    }

    if (!confirm('Сигурни ли сте, че искате да изтриете кампанията?')) {
      return;
    }

    this.error.set(null);
    this.loading.set(true);
    this.electionsManageService.remove(id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to delete election');
        this.loading.set(false);
      },
    });
  }

  private toApiDate(value: string): string | null {
    if (!value) return null;
    const date = value.trim();
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.replaceAll('-', '.');
    return null;
  }

  private insertElection(current: ElectionManageDto[], createdElection: ElectionManageDto): ElectionManageDto[] {
    const withoutDuplicate = current.filter((election) => election.id !== createdElection.id);
    return [...withoutDuplicate, createdElection].sort((a, b) => b.date.localeCompare(a.date));
  }
}
