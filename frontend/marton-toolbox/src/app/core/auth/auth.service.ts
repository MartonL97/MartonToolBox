import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { I18nService } from '../i18n/i18n.service';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Address of the profile picture; null or missing when the user has none. */
  avatarUrl?: string | null;
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

const ADMIN_KEY = 'mtb_is_admin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly token = signal(localStorage.getItem('mtb_token'));
  readonly user = signal<AuthUser | null>(JSON.parse(localStorage.getItem('mtb_user') ?? 'null'));
  readonly isAuthenticated = computed(() => !!this.token());
  /**
   * From /api/account; only used to show admin UI. The backend checks the role on every admin request. Remembered with
   * the session so the admin link shows straight away after a reload and survives a failed request.
   */
  readonly isAdmin = signal(!!localStorage.getItem('mtb_token') && localStorage.getItem(ADMIN_KEY) === '1');

  constructor() {
    if (this.token()) this.refreshProfile();
  }

  async refreshProfile() {
    try {
      const res = await firstValueFrom(this.http.get<{ data: { isAdmin: boolean; user?: AuthUser } }>('/api/account'));
      this.setAdmin(!!res.data.isAdmin);
      // Picks up a name or picture changed on another device.
      if (res.data.user && this.user()) this.storeUser({ ...this.user()!, ...res.data.user });
    } catch (err) {
      // Only a definite "not signed in / not allowed" drops it; a network error or restarting server keeps what we knew.
      const status = (err as HttpErrorResponse)?.status;
      if (status === 401 || status === 403) this.setAdmin(false);
    }
  }

  private setAdmin(isAdmin: boolean) {
    this.isAdmin.set(isAdmin);
    try {
      if (isAdmin) localStorage.setItem(ADMIN_KEY, '1');
      else localStorage.removeItem(ADMIN_KEY);
    } catch {
      /* not critical */
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
    if (user) this.storeUser({ ...user, displayName });
  }

  /** Shows a newly uploaded (or removed) profile picture in the header straight away. */
  updateAvatar(avatarUrl: string | null) {
    const user = this.user();
    if (user) this.storeUser({ ...user, avatarUrl });
  }

  private storeUser(user: AuthUser) {
    localStorage.setItem('mtb_user', JSON.stringify(user));
    this.user.set(user);
  }

  logout() {
    localStorage.removeItem('mtb_token');
    localStorage.removeItem('mtb_user');
    this.token.set(null);
    this.user.set(null);
    this.setAdmin(false);
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
