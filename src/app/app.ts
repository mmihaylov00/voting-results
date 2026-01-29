import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';
import { HlmButtonDirective } from './components/ui/button-helm/src/lib/hlm-button.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HlmButtonDirective],
  template: `
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
  `
})
export class App {
  public themeService = inject(ThemeService);
}
