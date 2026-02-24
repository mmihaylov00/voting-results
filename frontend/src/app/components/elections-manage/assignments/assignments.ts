import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { APP_ROLE } from '@votes/shared';
import { AuthService } from '../../../services/auth.service';
import { AssignmentsService } from '../../../services/assignments.service';
import { PositionsService, PositionDto } from '../../../services/positions.service';
import { ManagePeopleService, ManagePersonDto } from '../../../services/manage-people.service';
import { ManageSectionsService, ManageSectionDto } from '../../../services/manage-sections.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

type AssignmentDto = {
  id: string;
  personId: string;
  electionSectionId: string;
  positionId: string;
  person?: { id: string; fullName: string };
  section?: { id: string; sectionId: string; sectionName: string };
  position?: { id: string; name: string };
};

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
  ],
  templateUrl: './assignments.html',
})
export class AssignmentsComponent {
  electionId: string | null = null;
  positions = signal<PositionDto[]>([]);
  people = signal<ManagePersonDto[]>([]);
  sections = signal<ManageSectionDto[]>([]);
  assignments = signal<AssignmentDto[]>([]);
  filteredPeople = signal<ManagePersonDto[]>([]);
  filteredSections = signal<ManageSectionDto[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  createError = signal<string | null>(null);
  filterPositionId = '';
  filterOnlyUnassignedPeople = false;
  filterOnlyMissingSections = false;

  form = {
    positionId: '',
    personId: '',
    electionSectionId: '',
  };

  editTarget = signal<AssignmentDto | null>(null);
  editForm = {
    positionId: '',
    personId: '',
    electionSectionId: '',
  };

  visibleAssignments = computed(() => {
    const positionId = this.filterPositionId;
    return this.assignments().filter((a) => !positionId || a.positionId === positionId);
  });

  constructor(
    private route: ActivatedRoute,
    private assignmentsService: AssignmentsService,
    private positionsService: PositionsService,
    private managePeopleService: ManagePeopleService,
    private manageSectionsService: ManageSectionsService,
    private authService: AuthService,
  ) {
    this.electionId = this.route.snapshot.paramMap.get('id');
    this.load();
  }

  isAdmin(): boolean {
    return this.authService.hasRole(APP_ROLE.ADMIN);
  }

  load() {
    if (!this.electionId) return;
    this.loading.set(true);
    this.positionsService.list().subscribe((positions) => this.positions.set(positions));
    this.managePeopleService.list(this.electionId).subscribe((people) => this.people.set(people));
    this.manageSectionsService.list(this.electionId).subscribe((sections) => this.sections.set(sections));
    this.assignmentsService.list(this.electionId).subscribe({
      next: (data) => {
        this.assignments.set(data as AssignmentDto[]);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load assignments');
        this.loading.set(false);
      },
    });
  }

  onPositionSelection(positionId: string) {
    this.form.positionId = positionId;
    this.form.personId = '';
    this.form.electionSectionId = '';
    this.loadPositionFilters(positionId);
  }

  onFilterPositionChange(positionId: string) {
    this.filterPositionId = positionId;
    if (!positionId) {
      this.filteredPeople.set([]);
      this.filteredSections.set([]);
      return;
    }
    if (this.filterOnlyUnassignedPeople || this.filterOnlyMissingSections) {
      this.loadPositionFilters(positionId);
    }
  }

  onUnassignedToggle(checked: boolean) {
    this.filterOnlyUnassignedPeople = checked;
    if (checked && this.filterPositionId) {
      this.loadPeopleWithoutSection(this.filterPositionId);
    } else if (!checked) {
      this.filteredPeople.set([]);
    }
  }

  onMissingSectionsToggle(checked: boolean) {
    this.filterOnlyMissingSections = checked;
    if (checked && this.filterPositionId) {
      this.loadSectionsMissingPosition(this.filterPositionId);
    } else if (!checked) {
      this.filteredSections.set([]);
    }
  }

  create() {
    if (!this.electionId) return;
    if (!this.form.positionId || !this.form.personId || !this.form.electionSectionId) {
      this.createError.set('Изберете позиция, човек и секция.');
      return;
    }

    this.createError.set(null);
    this.assignmentsService
      .create({
        electionId: this.electionId,
        personId: this.form.personId,
        electionSectionId: this.form.electionSectionId,
        positionId: this.form.positionId,
      })
      .subscribe({
        next: () => {
          this.form = { positionId: '', personId: '', electionSectionId: '' };
          this.load();
        },
        error: (err) => this.createError.set(err?.error?.message || 'Неуспешно създаване.'),
      });
  }

  startEdit(assignment: AssignmentDto) {
    this.editTarget.set(assignment);
    this.editForm = {
      positionId: assignment.positionId,
      personId: assignment.personId,
      electionSectionId: assignment.electionSectionId,
    };
    this.loadPositionFilters(assignment.positionId, assignment);
  }

  cancelEdit() {
    this.editTarget.set(null);
  }

  saveEdit() {
    const target = this.editTarget();
    if (!this.electionId || !target) return;

    this.assignmentsService
      .update(this.electionId, target.id, {
        positionId: this.editForm.positionId,
        personId: this.editForm.personId,
        electionSectionId: this.editForm.electionSectionId,
      })
      .subscribe({
        next: () => {
          this.editTarget.set(null);
          this.load();
        },
        error: (err) => this.error.set(err?.error?.message || 'Неуспешно обновяване.'),
      });
  }

  remove(assignment: AssignmentDto) {
    if (!this.isAdmin()) {
      return;
    }

    if (!this.electionId) return;
    if (!confirm('Сигурни ли сте, че искате да изтриете разпределението?')) {
      return;
    }

    this.assignmentsService.remove(this.electionId, assignment.id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message || 'Неуспешно изтриване.'),
    });
  }

  peopleOptionsForForm() {
    if (this.form.positionId) {
      return this.filteredPeople().length > 0 ? this.filteredPeople() : this.people();
    }
    return this.people();
  }

  sectionOptionsForForm() {
    if (this.form.positionId) {
      return this.filteredSections().length > 0 ? this.filteredSections() : this.sections();
    }
    return this.sections();
  }

  peopleOptionsForEdit() {
    const selected = this.editTarget();
    if (!selected || !this.editForm.positionId) return this.people();
    const base = this.filteredPeople().length > 0 ? this.filteredPeople() : this.people();
    return this.ensureSelectedPersonInList(base, selected.personId, selected.person?.fullName);
  }

  sectionOptionsForEdit() {
    const selected = this.editTarget();
    if (!selected || !this.editForm.positionId) return this.sections();
    const base = this.filteredSections().length > 0 ? this.filteredSections() : this.sections();
    return this.ensureSelectedSectionInList(base, selected.electionSectionId, selected.section?.sectionId, selected.section?.sectionName);
  }

  private loadPositionFilters(positionId: string, current?: AssignmentDto) {
    if (!this.electionId || !positionId) return;

    this.assignmentsService.peopleWithoutSection(this.electionId, positionId).subscribe({
      next: (data) => {
        const people = data as ManagePersonDto[];
        if (current?.personId) {
          this.filteredPeople.set(this.ensureSelectedPersonInList(people, current.personId, current.person?.fullName));
        } else {
          this.filteredPeople.set(people);
        }
      },
      error: () => this.filteredPeople.set([]),
    });

    this.assignmentsService.sectionsMissingPosition(this.electionId, positionId).subscribe({
      next: (data) => {
        const sections = data as ManageSectionDto[];
        if (current?.electionSectionId) {
          this.filteredSections.set(
            this.ensureSelectedSectionInList(sections, current.electionSectionId, current.section?.sectionId, current.section?.sectionName),
          );
        } else {
          this.filteredSections.set(sections);
        }
      },
      error: () => this.filteredSections.set([]),
    });
  }

  private loadPeopleWithoutSection(positionId: string) {
    if (!this.electionId) return;
    this.assignmentsService.peopleWithoutSection(this.electionId, positionId).subscribe({
      next: (data) => this.filteredPeople.set(data as ManagePersonDto[]),
      error: () => this.filteredPeople.set([]),
    });
  }

  private loadSectionsMissingPosition(positionId: string) {
    if (!this.electionId) return;
    this.assignmentsService.sectionsMissingPosition(this.electionId, positionId).subscribe({
      next: (data) => this.filteredSections.set(data as ManageSectionDto[]),
      error: () => this.filteredSections.set([]),
    });
  }

  private ensureSelectedPersonInList(list: ManagePersonDto[], id: string, name?: string): ManagePersonDto[] {
    if (list.some((p) => p.id === id)) return list;
    return [{ id, electionId: this.electionId || '', fullName: name || 'Текущ избор' }, ...list];
  }

  private ensureSelectedSectionInList(list: ManageSectionDto[], id: string, sectionId?: string, sectionName?: string): ManageSectionDto[] {
    if (list.some((s) => s.id === id)) return list;
    return [{ id, electionId: this.electionId || '', sectionId: sectionId || '-', sectionName: sectionName || 'Текущ избор', cityName: '', regionName: '' }, ...list];
  }
}
