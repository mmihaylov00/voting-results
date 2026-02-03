import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';
import { HlmButtonDirective } from './components/ui/button-helm/src/lib/hlm-button.directive';

const SALT = 'static-salt-change-me';
const EXPECTED_HASH = '6465c8300318e8d0faba5c26a03a79b560da9568deca4e2988af795f7cb5704c';
const STORAGE_KEY = 'votes_password';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HlmButtonDirective],
  template: `
    @if (unlocked()) {
      <div class="fixed bottom-4 right-4 z-[200]">
        <button hlmBtn variant="ghost" size="icon" (click)="themeService.toggleDarkMode()" class="rounded-full bg-background/50 backdrop-blur-sm border border-primary/20 group hover:bg-primary dark:hover:bg-secondary">
          @if (themeService.darkMode()) {
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary transition-colors group-hover:text-primary-foreground"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-secondary"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          }
        </button>
      </div>
      <router-outlet></router-outlet>
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
export class App {
  public themeService = inject(ThemeService);
  public unlocked = signal(false);
  public password = signal('');
  public passwordError = signal(false);
  public errorMessage = signal<string | null>(null);
  public submitting = signal(false);

  public constructor() {
    void this.init();
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
}
