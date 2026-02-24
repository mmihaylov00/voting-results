import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppRole, AuthSessionDto } from '@votes/shared';
import { API_BASE_URL } from './api';
import { tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'votes.auth';
  private readonly sessionSignal = signal<AuthSessionDto | null>(this.loadSession());

  session = this.sessionSignal.asReadonly();

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http
      .post<AuthSessionDto>(`${API_BASE_URL}/auth/login`, { email, password })
      .pipe(tap((session) => this.setSession(session)));
  }

  logout() {
    this.clearSession();
    return this.http.post(`${API_BASE_URL}/auth/logout`, {});
  }

  isAuthenticated(): boolean {
    return !!this.sessionSignal()?.accessToken;
  }

  hasRole(...roles: AppRole[]): boolean {
    const session = this.sessionSignal();
    if (!session) return false;
    return roles.some((role) => session.user.roles.includes(role));
  }

  getAccessToken(): string | null {
    return this.sessionSignal()?.accessToken ?? null;
  }

  private loadSession(): AuthSessionDto | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthSessionDto;
    } catch {
      return null;
    }
  }

  private setSession(session: AuthSessionDto) {
    this.sessionSignal.set(session);
    localStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  private clearSession() {
    this.sessionSignal.set(null);
    localStorage.removeItem(this.storageKey);
  }
}
