import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { APP_ROLE, AppRole, getRoleName } from '@votes/shared';
import { Vote, FileUser, LogOut, LucideAngularModule, Moon, PanelLeftClose, PanelLeftOpen, Sun, Users } from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';
import { HlmButtonDirective } from './components/ui/button-helm/src/lib/hlm-button.directive';

const SALT = 'static-salt-change-me';
const EXPECTED_HASH = '6465c8300318e8d0faba5c26a03a79b560da9568deca4e2988af795f7cb5704c';
const STORAGE_KEY = 'votes_password';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, HlmButtonDirective, LucideAngularModule],
  template: `
    @if (unlocked()) {
      <div class="min-h-screen bg-background text-foreground">
        <div class="min-h-screen">
          @if (showSidebar()) {
            <aside
              class="fixed z-40 h-screen overflow-hidden border-r border-border bg-card/60 px-3 py-4 backdrop-blur-sm transition-all duration-300 ease-out flex flex-col justify-between"
              [class.inset-0]="isMobile()"
              [class.inset-y-0]="!isMobile()"
              [class.left-0]="!isMobile()"
              [class.w-full]="isMobile()"
              [class.w-72]="!isMobile() && sidebarOpen()"
              [class.w-20]="!isMobile() && !sidebarOpen()"
              [class.translate-x-0]="sidebarOpen()"
              [class.-translate-x-full]="isMobile() && !sidebarOpen()"
            >
              <div>
              <div class="mb-4 flex items-center" [class.justify-between]="sidebarOpen()" [class.justify-center]="!sidebarOpen()">
                @if (sidebarOpen()) {
                  <div class="flex items-center gap-2">
                    <img src="logo.png" alt="Logo" class="h-8 w-auto rounded-sm" />
                    <div class="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tracking-wide text-primary">
                      {{ currentRoleName() }}
                    </div>
                  </div>
                }
                  <button hlmBtn variant="ghost" size="icon" (click)="toggleSidebar()">
                    <lucide-icon [img]="sidebarOpen() ? icons.panelLeftClose : icons.panelLeftOpen" size="16"></lucide-icon>
                  </button>
                </div>

                <nav class="space-y-1">
                  @for (item of visibleTabs(); track item.path) {
                    <a
                      [routerLink]="item.path"
                      (click)="onNavClick()"
                      class="group flex items-center gap-0 rounded-md px-2 py-2 text-sm transition-all duration-200 hover:bg-accent/70 hover:text-accent-foreground"
                      [class.bg-primary]="isTabActive(item.path)"
                      [class.text-primary-foreground]="isTabActive(item.path)"
                      [class.shadow-sm]="isTabActive(item.path)"
                      [class.justify-start]="sidebarOpen()"
                      [class.justify-center]="!sidebarOpen()"
                    >
                      <lucide-icon [img]="item.icon" size="16" class="shrink-0"></lucide-icon>
                      @if (sidebarOpen()) {
                        <span class="truncate ml-3">{{ item.label }}</span>
                      }
                    </a>
                  }
                </nav>
              </div>

              <div class="mt-4 border-t border-border pt-3">
                @if (sidebarOpen()) {
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium">{{ currentUserName() }}</div>
                      <div class="truncate text-xs text-muted-foreground">{{ currentUserEmail() }}</div>
                    </div>
                    <button hlmBtn variant="outline" size="icon" (click)="logout()">
                      <lucide-icon [img]="icons.logOut" size="16"></lucide-icon>
                    </button>
                  </div>
                } @else {
                  <button hlmBtn variant="outline" class="w-full justify-center" (click)="logout()">
                    <lucide-icon [img]="icons.logOut" size="16"></lucide-icon>
                  </button>
                }
              </div>
            </aside>
            @if (isMobile() && !sidebarOpen()) {
              <button hlmBtn variant="outline" size="icon" class="fixed left-4 top-4 z-50" (click)="toggleSidebar()">
                <lucide-icon [img]="icons.panelLeftOpen" size="16"></lucide-icon>
              </button>
            }
          }

          <main
            class="min-w-0 transition-[margin] duration-300 ease-out"
            [class.ml-72]="showSidebar() && !isMobile() && sidebarOpen()"
            [class.ml-20]="showSidebar() && !isMobile() && !sidebarOpen()"
          >
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>

      <div class="fixed bottom-4 right-4 z-[200]">
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          (click)="themeService.toggleDarkMode()"
          class="rounded-full bg-background/50 backdrop-blur-sm border border-primary/20 group hover:bg-primary dark:hover:bg-secondary"
        >
          @if (themeService.darkMode()) {
            <lucide-icon [img]="icons.sun" size="18" class="text-primary transition-colors group-hover:text-primary-foreground"></lucide-icon>
          } @else {
            <lucide-icon [img]="icons.moon" size="18" class="text-secondary"></lucide-icon>
          }
        </button>
      </div>
    } @else {
      <div class="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950 text-slate-100">
        <div class="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
          <div class="text-lg font-semibold">Въведи парола</div>
          <div class="mt-1 text-sm text-slate-400">Достъпът е защитен.</div>
          @if (errorMessage()) {
            <div class="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {{ errorMessage() }}
            </div>
          } @else {
            <form class="mt-4 space-y-3" (submit)="submit($event)">
              <input
                type="password"
                class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 outline-none focus:border-amber-400"
                autocomplete="current-password"
                placeholder="Парола"
                [value]="password()"
                (input)="onPasswordInput($event)"
              />
              @if (passwordError()) {
                <div class="text-sm text-red-300">Грешна парола. Опитай отново.</div>
              }
              <button
                type="submit"
                class="w-full rounded-lg border border-amber-400 bg-amber-300 px-3 py-2 text-base font-semibold text-slate-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
                [disabled]="submitting()"
              >
                Продължи
              </button>
            </form>
          }
        </div>
      </div>
    }
  `
})
export class App implements OnDestroy {
  public themeService = inject(ThemeService);
  public authService = inject(AuthService);
  public router = inject(Router);
  public unlocked = signal(false);
  public password = signal('');
  public passwordError = signal(false);
  public errorMessage = signal<string | null>(null);
  public submitting = signal(false);
  public sidebarOpen = signal(false);
  public isMobile = signal(false);
  private mediaQuery: MediaQueryList | null = null;
  public icons = {
    house: Vote,
    users: Users,
    positions: FileUser,
    logOut: LogOut,
    panelLeftClose: PanelLeftClose,
    panelLeftOpen: PanelLeftOpen,
    sun: Sun,
    moon: Moon,
  };
  public visibleTabs = computed(() => {
    const session = this.authService.session();
    if (!session) return [];

    const tabs: { label: string; path: string; roles: AppRole[]; icon: LucideIconData; exact?: boolean }[] = [
      { label: 'Избори', path: '/', roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER], icon: this.icons.house, exact: true },
      { label: 'Потребители', path: '/admin/users', roles: [APP_ROLE.ADMIN], icon: this.icons.users },
      { label: 'Позиции', path: '/admin/positions', roles: [APP_ROLE.ADMIN], icon: this.icons.positions },
    ];

    return tabs.filter((tab) => tab.roles.some((role) => session.user.roles.includes(role)));
  });
  public currentRoleName = computed(() => {
    const role = this.authService.session()?.user.role;
    return role ? getRoleName(role) : '';
  });
  public currentUserName = computed(() => this.authService.session()?.user.name || 'Потребител');
  public currentUserEmail = computed(() => this.authService.session()?.user.email || '');

  public constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.mediaQuery = window.matchMedia('(max-width: 767px)');
      this.isMobile.set(this.mediaQuery.matches);
      this.mediaQuery.addEventListener('change', this.handleMediaQueryChange);
    }
    void this.init();
  }

  public ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.handleMediaQueryChange);
  }

  public onPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.password.set(target?.value ?? '');
    if (this.passwordError()) {
      this.passwordError.set(false);
    }
  }

  public async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.submitting() || this.errorMessage()) {
      return;
    }

    this.submitting.set(true);
    try {
      const value = this.password();
      const ok = await this.verifyPassword(value);
      if (ok) {
        localStorage.setItem(STORAGE_KEY, value);
        this.unlocked.set(true);
        return;
      }
      this.passwordError.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  private async init(): Promise<void> {
    if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') {
      this.errorMessage.set('Използвай модерен браузър (например Chrome/Safari) за да продължиш.');
      return;
    }

    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return;
    }

    if (await this.verifyPassword(cached)) {
      this.unlocked.set(true);
    }
  }

  private async verifyPassword(value: string): Promise<boolean> {
    if (!value) {
      return false;
    }
    const h = await this.sha256(SALT + value);
    return h === EXPECTED_HASH;
  }

  private async sha256(str: string): Promise<string> {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  public showSidebar(): boolean {
    const session = this.authService.session();
    if (!session) return false;
    return session.user.role !== APP_ROLE.VIEWER;
  }

  public logout(): void {
    this.authService.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => void this.router.navigateByUrl('/login'),
    });
  }

  public toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  public onNavClick(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  public isTabActive(path: string): boolean {
    const url = this.router.url || '';
    if (path === '/') {
      return url === '/' || url.startsWith('/election/');
    }
    return url === path || url.startsWith(`${path}/`);
  }

  private readonly handleMediaQueryChange = (event: MediaQueryListEvent): void => {
    this.isMobile.set(event.matches);
    if (event.matches) {
      this.sidebarOpen.set(false);
    }
  };
}
