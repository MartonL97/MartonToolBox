import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { I18nService } from '../i18n/i18n.service';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}
interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

/** The API's error as one readable sentence; with i18n, in the user's language (Identity errors by their code). */
export function extractAuthError(err: any, i18n?: I18nService): string {
  const body = err?.error;
  if (!body) return i18n ? i18n.t('common.network_error') : 'Something went wrong. Please try again.';
  if (typeof body.error === 'string') return i18n ? i18n.server(body.error) : body.error;
  if (Array.isArray(body.errors))
    return (
      body.errors
        // English keeps the server's own wording; other languages use ours for the codes we know.
        .map((e: any) =>
          i18n && i18n.lang() !== 'en' && e?.code ? i18n.tOr(`identity.${e.code}`, e.description ?? e.code) : (e.description ?? e),
        )
        .join(' ') || 'Please check your details and try again.'
    );
  if (body.errors && typeof body.errors === 'object')
    return Object.values(body.errors).flat().join(' ') || 'Please check your details and try again.';
  if (typeof body.title === 'string') return body.title;
  return 'Something went wrong. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly token = signal(localStorage.getItem('mtb_token'));
  readonly user = signal<AuthUser | null>(JSON.parse(localStorage.getItem('mtb_user') ?? 'null'));
  readonly isAuthenticated = computed(() => !!this.token());
  /** From /api/account; only used to show admin UI. The backend checks the role on every admin request. */
  readonly isAdmin = signal(false);

  constructor() {
    if (this.token()) this.refreshProfile();
  }

  async refreshProfile() {
    try {
      const res = await firstValueFrom(this.http.get<{ data: { isAdmin: boolean } }>('/api/account'));
      this.isAdmin.set(!!res.data.isAdmin);
    } catch {
      this.isAdmin.set(false);
    }
  }

  async login(email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ data: AuthResult }>('/api/auth/login', { email, password }));
    this.setSession(res.data);
  }

  /** Creates an inactive account and emails a confirmation link; does not sign in. */
  async register(displayName: string, email: string, password: string, confirmPassword: string) {
    const res = await firstValueFrom(
      this.http.post<{ data: { email: string; emailSent: boolean } }>('/api/auth/register', {
        displayName,
        email,
        password,
        confirmPassword,
      }),
    );
    return res.data;
  }

  /** Activates the account from the emailed link and signs the user in. */
  async confirmEmail(userId: string, token: string) {
    const res = await firstValueFrom(this.http.post<{ data: AuthResult }>('/api/auth/confirm-email', { userId, token }));
    this.setSession(res.data);
  }

  async resendConfirmation(email: string) {
    await firstValueFrom(this.http.post('/api/auth/resend-confirmation', { email }));
  }

  async forgotPassword(email: string) {
    await firstValueFrom(this.http.post('/api/auth/forgot-password', { email }));
  }

  /** Sets a new password from the emailed link and signs the user in. */
  async resetPassword(userId: string, token: string, password: string, confirmPassword: string) {
    const res = await firstValueFrom(
      this.http.post<{ data: AuthResult }>('/api/auth/reset-password', { userId, token, password, confirmPassword }),
    );
    this.setSession(res.data);
  }

  /** Keeps the header/avatar in sync after the user renames themselves on the account page. */
  updateDisplayName(displayName: string) {
    const user = this.user();
    if (!user) return;
    const updated = { ...user, displayName };
    localStorage.setItem('mtb_user', JSON.stringify(updated));
    this.user.set(updated);
  }

  logout() {
    localStorage.removeItem('mtb_token');
    localStorage.removeItem('mtb_user');
    this.token.set(null);
    this.user.set(null);
    this.isAdmin.set(false);
  }

  private setSession(result: AuthResult) {
    localStorage.setItem('mtb_token', result.accessToken);
    localStorage.setItem('mtb_user', JSON.stringify(result.user));
    this.token.set(result.accessToken);
    this.user.set(result.user);
    this.refreshProfile();
  }
}

/** Where to go after auth: a local path from ?returnUrl, never an external URL. */
export function safeReturnUrl(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}
