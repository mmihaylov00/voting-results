import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { APP_ROLE, APP_ROLES, AppRole, getRoleName, isAppRole } from '@votes/shared';
import { UsersService, UserDto } from '../../../services/users.service';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import { BaseModalComponent } from '../../ui/base-modal/base-modal';
import { SearchFilterComponent } from '../../ui/search-filter/search-filter';
import { SortableTableHeaderComponent } from '../../ui/sortable-table-header/sortable-table-header';
import { HlmNumberedPagination } from '../../ui/pagination/src';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

@Component({
  selector: 'app-admin-users',
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
    SearchFilterComponent,
    SortableTableHeaderComponent,
    HlmNumberedPagination,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
  ],
  templateUrl: './users.html',
})
export class AdminUsersComponent {
  readonly roleOptions = APP_ROLES;
  readonly roleName = getRoleName;
  readonly pageSizeOptions = [5, 10, 20, 50];
  users = signal<UserDto[]>([]);
  error = signal<string | null>(null);
  createError = signal<string | null>(null);
  loading = signal(false);
  createModalOpen = signal(false);
  searchName = signal('');
  filterRole = signal<'all' | AppRole>('all');
  sortColumn = signal<'email' | 'name' | 'role'>('email');
  sortDirection = signal<'asc' | 'desc'>('asc');
  currentPage = signal(1);
  pageSize = signal(10);

  form = {
    email: '',
    password: '',
    name: '',
    role: APP_ROLE.CAMPAIGN_MANAGER as AppRole,
  };

  filteredAndSortedUsers = computed(() => {
    const term = this.searchName().trim().toLowerCase();
    const role = this.filterRole();
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const filtered = this.users().filter((user) => {
      const name = (user.name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const roleKey = this.userRoleKey(user);

      const nameMatch = !term || name.includes(term) || email.includes(term);
      const roleMatch = role === 'all' || roleKey === role;
      return nameMatch && roleMatch;
    });

    filtered.sort((a, b) => {
      let left = '';
      let right = '';

      if (column === 'email') {
        left = a.email || '';
        right = b.email || '';
      } else if (column === 'name') {
        left = a.name || '';
        right = b.name || '';
      } else {
        left = this.roleLabel(a);
        right = this.roleLabel(b);
      }

      const compare = left.localeCompare(right, 'bg', { sensitivity: 'base' });
      return direction === 'asc' ? compare : -compare;
    });

    return filtered;
  });

  totalPages = computed(() => {
    const total = this.filteredAndSortedUsers().length;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  paginatedUsers = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredAndSortedUsers().slice(start, start + size);
  });

  constructor(private readonly usersService: UsersService) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.usersService.list().subscribe({
      next: (users) => {
        this.users.set(users);
        this.currentPage.set(1);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load users');
        this.loading.set(false);
      },
    });
  }

  create() {
    this.createError.set(null);
    this.loading.set(true);
    this.usersService
      .create({
        email: this.form.email,
        password: this.form.password,
        name: this.form.name || undefined,
        role: this.form.role,
      })
      .subscribe({
        next: () => {
          this.form = { email: '', password: '', name: '', role: APP_ROLE.CAMPAIGN_MANAGER };
          this.createModalOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.createError.set(err?.error?.message || 'Failed to create user');
          this.loading.set(false);
        },
      });
  }

  openCreateModal() {
    this.createError.set(null);
    this.form = { email: '', password: '', name: '', role: APP_ROLE.CAMPAIGN_MANAGER };
    this.createModalOpen.set(true);
  }

  closeCreateModal() {
    this.createModalOpen.set(false);
  }

  canSubmitCreate(): boolean {
    return !!this.form.email.trim() && !!this.form.password.trim() && !!this.form.name.trim() && !!this.form.role;
  }

  remove(id: string) {
    if (!confirm('Сигурни ли сте, че искате да изтриете този потребител?')) {
      return;
    }

    this.loading.set(true);
    this.usersService.remove(id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to delete user');
        this.loading.set(false);
      },
    });
  }

  onSearchChange(value: string) {
    this.searchName.set(value);
    this.currentPage.set(1);
  }

  onRoleFilterChange(value: 'all' | AppRole) {
    this.filterRole.set(value);
    this.currentPage.set(1);
  }

  onSort(column: string) {
    const target = column as 'email' | 'name' | 'role';
    if (this.sortColumn() === target) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(target);
      this.sortDirection.set('asc');
    }
  }

  resultRangeLabel(): string {
    const total = this.filteredAndSortedUsers().length;
    if (total === 0) return '0 от 0';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(total, this.currentPage() * this.pageSize());
    return `${start}-${end} от ${total}`;
  }

  roleLabel(user: UserDto): string {
    const role = this.userRoleKey(user);
    return role ? getRoleName(role) : '-';
  }

  private userRoleKey(user: UserDto): AppRole | null {
    return this.toAppRole(user.role) ?? this.toAppRole(user.roles?.[0]);
  }

  private toAppRole(value: unknown): AppRole | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase().replace('-', '_');
    if (isAppRole(normalized)) {
      return normalized;
    }

    if (normalized === 'campaignmanager') {
      return APP_ROLE.CAMPAIGN_MANAGER;
    }

    return null;
  }
}
