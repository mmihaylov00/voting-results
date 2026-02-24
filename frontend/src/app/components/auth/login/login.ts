import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { APP_ROLE } from '@votes/shared';
import { AuthService } from '../../../services/auth.service';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';

@Component({
  selector: 'app-login',
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
  ],
  templateUrl: './login.html',
})
export class LoginComponent {
  email = '';
  password = '';
  error = signal<string | null>(null);
  loading = signal(false);
  private redirectUrl: string | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.redirectUrl = this.route.snapshot.queryParamMap.get('redirect');
  }

  onSubmit() {
    this.error.set(null);
    this.loading.set(true);

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        const target = this.getRedirectTarget();
        this.router.navigateByUrl(target);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Invalid credentials');
      },
    });
  }

  private getRedirectTarget(): string {
    const redirect = this.redirectUrl || '';
    if (redirect.startsWith('/')) {
      return redirect;
    }

    if (this.authService.hasRole(APP_ROLE.ADMIN)) {
      return '/admin/users';
    }

    if (this.authService.hasRole(APP_ROLE.CAMPAIGN_MANAGER)) {
      return '/elections';
    }

    return '/';
  }
}
