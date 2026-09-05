import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `<section class="page auth-page"><div class="auth-card">
    <p class="eyebrow">GET STARTED</p>
    <h1>Create your account</h1>
    <p class="lead">Free to join. Your files never leave your browser.</p>
    <form (submit)="submit($event)">
      <label>Name<input type="text" [value]="displayName()" (input)="displayName.set($any($event.target).value)" required></label>
      <label>Email<input type="email" [value]="email()" (input)="email.set($any($event.target).value)" required></label>
      <label>Password<input type="password" [value]="password()" (input)="password.set($any($event.target).value)" minlength="8" required></label>
      <small>At least 8 characters.</small>
      @if (error()) { <p class="error-text">{{ error() }}</p> }
      <button class="primary" type="submit" [disabled]="loading()">{{ loading() ? 'Creating account…' : 'Create account' }}</button>
    </form>
    <p class="auth-switch">Already have an account? <a routerLink="/login">Log in</a></p>
  </div></section>`
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  displayName = signal('');
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');

  async submit(event: Event) {
    event.preventDefault();
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.register(this.displayName(), this.email(), this.password());
      this.router.navigateByUrl('/account');
    } catch (err) {
      this.error.set(extractAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
