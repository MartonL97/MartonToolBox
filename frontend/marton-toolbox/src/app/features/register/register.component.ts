import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page auth-page"><div class="auth-card">
    @if (sentTo()) {
      <div class="auth-done">
        <span class="auth-done-icon"><mtb-icon name="check" /></span>
        <h1>Check your inbox</h1>
        <p class="lead">We sent a confirmation link to <strong>{{ sentTo() }}</strong>. Click it to activate your account — then you're in.</p>
        @if (!emailSent()) { <p class="error-text">We couldn't send the email just now. Use the button below to try again.</p> }
        <p class="hint">Didn't get it? Check your spam folder, or send it again.</p>
        <button class="secondary block" (click)="resend()" [disabled]="resending() || resent()">{{ resent() ? 'Sent — check your inbox' : resending() ? 'Sending…' : 'Resend confirmation email' }}</button>
        <p class="auth-switch">Already confirmed? <a routerLink="/login">Log in</a></p>
      </div>
    } @else {
      <p class="eyebrow">GET STARTED</p>
      <h1>Create your account</h1>
      <p class="lead">Free to join. Your files never leave your browser.</p>
      <form (submit)="submit($event)">
        <label>Name<input type="text" autocomplete="name" [value]="displayName()" (input)="displayName.set($any($event.target).value)" required></label>
        <label>Email<input type="email" autocomplete="email" [value]="email()" (input)="email.set($any($event.target).value)" required></label>
        <label>Password<input type="password" autocomplete="new-password" [value]="password()" (input)="password.set($any($event.target).value)" minlength="8" required></label>
        <small>At least 8 characters, with a number, an uppercase and a lowercase letter.</small>
        <label>Confirm password<input type="password" autocomplete="new-password" [value]="confirm()" (input)="confirm.set($any($event.target).value)" [class.invalid]="mismatch()" required></label>
        @if (mismatch()) { <small class="field-error">The passwords don't match.</small> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="loading() || mismatch()">{{ loading() ? 'Creating account…' : 'Create account' }}</button>
      </form>
      <p class="auth-switch">Already have an account? <a routerLink="/login" queryParamsHandling="preserve">Log in</a></p>
    }
  </div></section>`
})
export class RegisterComponent {
  private auth = inject(AuthService);
  displayName = signal('');
  email = signal('');
  password = signal('');
  confirm = signal('');
  loading = signal(false);
  error = signal('');
  sentTo = signal('');
  emailSent = signal(true);
  resending = signal(false);
  resent = signal(false);
  /** Only complain once the user has typed something in the confirmation field. */
  mismatch = computed(() => this.confirm().length > 0 && this.confirm() !== this.password());

  async submit(event: Event) {
    event.preventDefault();
    if (this.password() !== this.confirm()) { this.error.set('The passwords don\'t match.'); return; }
    this.error.set('');
    this.loading.set(true);
    try {
      const res = await this.auth.register(this.displayName(), this.email(), this.password(), this.confirm());
      this.emailSent.set(res.emailSent);
      this.sentTo.set(res.email);
    } catch (err) {
      this.error.set(extractAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async resend() {
    this.resending.set(true);
    try { await this.auth.resendConfirmation(this.sentTo()); this.resent.set(true); }
    catch { /* the endpoint always succeeds unless the network fails; let the user retry */ }
    finally { this.resending.set(false); }
  }
}
