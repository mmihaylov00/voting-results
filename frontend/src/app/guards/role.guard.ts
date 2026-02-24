import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AppRole } from '@votes/shared';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const roles = route.data['roles'] as AppRole[] | undefined;
    if (!roles || roles.length === 0) return true;
    if (this.authService.hasRole(...roles)) return true;
    this.router.navigate(['/']);
    return false;
  }
}
