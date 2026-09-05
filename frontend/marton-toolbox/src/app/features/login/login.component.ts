import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `<section class="page auth-page"><div class="auth-card">
    <p class="eyebrow">WELCOME BACK</p>
    <h1>Log in</h1>
    <p class="lead">Access your account and license.</p>
    <form (submit)="submit($event)">
      <label>Email<input type="email" [value]="email()" (input)="email.set($any($event.target).value)" required></label>
      <label>Password<input type="password" [value]="password()" (input)="password.set($any($event.target).value)" required></label>
      @if (error()) { <p class="error-text">{{ error() }}</p> }
      <button class="primary" type="submit" [disabled]="loading()">{{ loading() ? 'Logging in…' : 'Log in' }}</button>
    </form>
    <p class="auth-switch">No account yet? <a routerLink="/register">Create one</a></p>
  </div></section>`
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');

  async submit(event: Event) {
    event.preventDefault();
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.login(this.email(), this.password());
      this.router.navigateByUrl('/account');
    } catch (err) {
      this.error.set(extractAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
