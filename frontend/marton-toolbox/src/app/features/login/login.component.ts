import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError, safeReturnUrl } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `<section class="page auth-page"><div class="auth-card">
    <p class="eyebrow">WELCOME BACK</p>
    <h1>Log in</h1>
    <p class="lead">Access your account and license.</p>
    @if (sessionExpired()) { <p class="error-text">Your session expired. Please log in again.</p> }
    <form (submit)="submit($event)">
      <label>Email<input type="email" [value]="email()" (input)="email.set($any($event.target).value)" required></label>
      <label>Password<input type="password" [value]="password()" (input)="password.set($any($event.target).value)" required></label>
      @if (error()) { <p class="error-text">{{ error() }}</p> }
      @if (unconfirmed()) {
        <button class="secondary" type="button" (click)="resend()" [disabled]="resending() || resent()">{{ resent() ? 'Sent — check your inbox' : resending() ? 'Sending…' : 'Resend confirmation email' }}</button>
      }
      <button class="primary" type="submit" [disabled]="loading()">{{ loading() ? 'Logging in…' : 'Log in' }}</button>
    </form>
    <p class="auth-switch">No account yet? <a routerLink="/register" queryParamsHandling="preserve">Create one</a></p>
  </div></section>`
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  unconfirmed = signal(false);
  resending = signal(false);
  resent = signal(false);
  sessionExpired = signal(this.route.snapshot.queryParamMap.get('expired') === '1');

  async submit(event: Event) {
    event.preventDefault();
    this.error.set('');
    this.unconfirmed.set(false);
    this.resent.set(false);
    this.loading.set(true);
    try {
      await this.auth.login(this.email(), this.password());
      this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
    } catch (err: any) {
      this.unconfirmed.set(err?.error?.code === 'email_not_confirmed');
      this.error.set(extractAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async resend() {
    this.resending.set(true);
    try { await this.auth.resendConfirmation(this.email()); this.resent.set(true); }
    catch { /* network error: allow another try */ }
    finally { this.resending.set(false); }
  }
}
