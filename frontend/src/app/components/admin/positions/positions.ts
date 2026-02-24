import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PositionsService, PositionDto } from '../../../services/positions.service';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import { BaseModalComponent } from '../../ui/base-modal/base-modal';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

@Component({
  selector: 'app-admin-positions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmInputDirective,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    BaseModalComponent,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
  ],
  templateUrl: './positions.html',
})
export class AdminPositionsComponent {
  positions = signal<PositionDto[]>([]);
  error = signal<string | null>(null);
  loading = signal(false);

  createModalOpen = signal(false);
  editModalOpen = signal(false);
  formError = signal<string | null>(null);
  createName = '';
  createColor = '#64748b';
  editName = '';
  editColor = '#64748b';
  editPositionId: string | null = null;

  constructor(private readonly positionsService: PositionsService) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.positionsService.list().subscribe({
      next: (positions) => {
        this.positions.set(positions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load positions');
        this.loading.set(false);
      },
    });
  }

  openCreateModal() {
    this.createName = '';
    this.createColor = '#64748b';
    this.formError.set(null);
    this.createModalOpen.set(true);
  }

  closeCreateModal() {
    this.createModalOpen.set(false);
  }

  canSubmitCreate(): boolean {
    return !!this.createName.trim() && !!this.createColor;
  }

  create() {
    const name = this.createName.trim();
    if (!name) {
      this.formError.set('Името е задължително.');
      return;
    }

    this.loading.set(true);
    this.formError.set(null);
    this.positionsService.create({ name, color: this.createColor }).subscribe({
      next: () => {
        this.createModalOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Неуспешно създаване.');
        this.loading.set(false);
      },
    });
  }

  openEditModal(position: PositionDto) {
    this.editPositionId = position.id;
    this.editName = position.name;
    this.editColor = position.color || '#64748b';
    this.formError.set(null);
    this.editModalOpen.set(true);
  }

  closeEditModal() {
    this.editModalOpen.set(false);
    this.editPositionId = null;
  }

  saveEdit() {
    if (!this.editPositionId) return;
    const name = this.editName.trim();
    if (!name) {
      this.formError.set('Името е задължително.');
      return;
    }

    this.loading.set(true);
    this.formError.set(null);
    this.positionsService.update(this.editPositionId, { name, color: this.editColor }).subscribe({
      next: () => {
        this.editModalOpen.set(false);
        this.editPositionId = null;
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Неуспешно обновяване.');
        this.loading.set(false);
      },
    });
  }

  remove(position: PositionDto) {
    if (!confirm(`Сигурни ли сте, че искате да изтриете позиция "${position.name}"?`)) {
      return;
    }

    this.loading.set(true);
    this.positionsService.remove(position.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error.set(err?.error?.message || 'Неуспешно изтриване.');
        this.loading.set(false);
      },
    });
  }
}
