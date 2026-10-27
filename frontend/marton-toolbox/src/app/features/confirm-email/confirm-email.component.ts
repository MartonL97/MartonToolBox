import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

/** Target of the link in the confirmation email: activates the account, signs in, and moves on. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page auth-page"><div class="auth-card">
    @switch (state()) {
      @case ('working') {
        <div class="auth-done"><span class="spinner"></span><h1>Confirming your email…</h1></div>
      }
      @case ('done') {
        <div class="auth-done">
          <span class="auth-done-icon"><mtb-icon name="check" /></span>
          <h1>Your account is active</h1>
          <p class="lead">Welcome to MartonToolBox! Taking you to your dashboard…</p>
          <a class="primary block" routerLink="/dashboard">Go to dashboard</a>
        </div>
      }
      @case ('already') {
        <div class="auth-done">
          <span class="auth-done-icon"><mtb-icon name="check" /></span>
          <h1>Already confirmed</h1>
          <p class="lead">Your email is already confirmed. Log in to continue.</p>
          <a class="primary block" routerLink="/login">Log in</a>
        </div>
      }
      @case ('failed') {
        <p class="eyebrow">EMAIL CONFIRMATION</p>
        <h1>Link not valid</h1>
        <p class="lead">{{ error() }}</p>
        <form (submit)="resend($event)">
          <label>Email<input type="email" autocomplete="email" [value]="email()" (input)="email.set($any($event.target).value)" required></label>
          <button class="primary" type="submit" [disabled]="resending() || resent()">{{ resent() ? 'Sent — check your inbox' : resending() ? 'Sending…' : 'Send a new link' }}</button>
        </form>
        <p class="auth-switch"><a routerLink="/login">Back to log in</a></p>
      }
    }
  </div></section>`
})
export class ConfirmEmailComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  state = signal<'working' | 'done' | 'already' | 'failed'>('working');
  error = signal('');
  email = signal('');
  resending = signal(false);
  resent = signal(false);

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const userId = params.get('userId'), token = params.get('token');
    if (!userId || !token) { this.fail('This confirmation link is incomplete. Make sure you copied the whole link.'); return; }
    this.auth.confirmEmail(userId, token)
      .then(() => { this.state.set('done'); setTimeout(() => this.router.navigateByUrl('/dashboard'), 2500); })
      .catch((err: HttpErrorResponse) => {
        if (err.status === 409) this.state.set('already');
        else if (err.status === 0 || err.status >= 500) this.fail('We couldn\'t reach the server. Please try the link again in a moment.');
        else this.fail(err.error?.error ?? 'This confirmation link is invalid or has expired. Enter your email to get a new one.');
      });
  }

  async resend(event: Event) {
    event.preventDefault();
    this.resending.set(true);
    try { await this.auth.resendConfirmation(this.email()); this.resent.set(true); }
    catch { /* network error: allow another try */ }
    finally { this.resending.set(false); }
  }

  private fail(message: string) { this.error.set(message); this.state.set('failed'); }
}
