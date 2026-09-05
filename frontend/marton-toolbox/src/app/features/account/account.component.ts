import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface License { licenseKey: string; product: string; status: string; expiresAt: string | null; }
interface AccountData { user: { id: string; email: string; displayName: string }; license: License | null; }

@Component({
  standalone: true,
  template: `<section class="page tool-page">
    <p class="eyebrow">YOUR ACCOUNT</p>
    <h1>{{ account()?.user?.displayName ?? 'Account' }}</h1>
    <p class="lead">{{ account()?.user?.email }}</p>
    @if (loading()) { <p>Loading…</p> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }
    @if (account()) {
      <div class="stats">
        <div><span>License</span><strong>{{ account()!.license ? account()!.license!.status : 'None' }}</strong></div>
        <div><span>Product</span><strong>{{ account()!.license?.product ?? '—' }}</strong></div>
      </div>
      <button class="secondary" (click)="logout()">Log out</button>
    }
  </section>`
})
export class AccountComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  account = signal<AccountData | null>(null);
  loading = signal(true);
  error = signal('');

  constructor() {
    this.http.get<{ data: AccountData }>('/api/account').subscribe({
      next: res => { this.account.set(res.data); this.loading.set(false); },
      error: () => { this.error.set('Could not load your account.'); this.loading.set(false); }
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
