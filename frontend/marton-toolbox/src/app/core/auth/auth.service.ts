import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthUser { id: string; email: string; displayName: string; }
interface AuthResult { accessToken: string; refreshToken: string; expiresAt: string; user: AuthUser; }

export function extractAuthError(err: any): string {
  const body = err?.error;
  if (!body) return 'Something went wrong. Please try again.';
  if (typeof body.error === 'string') return body.error;
  if (Array.isArray(body.errors)) return body.errors.map((e: any) => e.description ?? e).join(' ') || 'Please check your details and try again.';
  if (body.errors && typeof body.errors === 'object') return Object.values(body.errors).flat().join(' ') || 'Please check your details and try again.';
  if (typeof body.title === 'string') return body.title;
  return 'Something went wrong. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly token = signal(localStorage.getItem('mtb_token'));
  readonly user = signal<AuthUser | null>(JSON.parse(localStorage.getItem('mtb_user') ?? 'null'));
  readonly isAuthenticated = computed(() => !!this.token());

  async login(email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ data: AuthResult }>('/api/auth/login', { email, password }));
    this.setSession(res.data);
  }

  async register(displayName: string, email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ data: AuthResult }>('/api/auth/register', { displayName, email, password }));
    this.setSession(res.data);
  }

  logout() {
    localStorage.removeItem('mtb_token');
    localStorage.removeItem('mtb_user');
    this.token.set(null);
    this.user.set(null);
  }

  private setSession(result: AuthResult) {
    localStorage.setItem('mtb_token', result.accessToken);
    localStorage.setItem('mtb_user', JSON.stringify(result.user));
    this.token.set(result.accessToken);
    this.user.set(result.user);
  }
}
