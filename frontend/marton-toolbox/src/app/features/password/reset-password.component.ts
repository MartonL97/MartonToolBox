import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

/** Target of the link in the password reset email. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private userId: string;
  private token: string;
  password = signal('');
  confirm = signal('');
  loading = signal(false);
  done = signal(false);
  linkInvalid = signal(false);
  error = signal('');
  mismatch = computed(() => this.confirm().length > 0 && this.confirm() !== this.password());

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.userId = params.get('userId') ?? '';
    this.token = params.get('token') ?? '';
    if (!this.userId || !this.token) {
      this.error.set('This reset link is incomplete. Make sure you copied the whole link.');
      this.linkInvalid.set(true);
    }
  }

  async submit(event: Event) {
    event.preventDefault();
    if (this.password() !== this.confirm()) {
      this.error.set("The passwords don't match.");
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.userId, this.token, this.password(), this.confirm());
      this.done.set(true);
      setTimeout(() => this.router.navigateByUrl('/dashboard'), 2500);
    } catch (err) {
      const e = err as HttpErrorResponse;
      // A malformed userId fails model binding (no "code"); treat it like any other bad link.
      if (e.error?.code === 'invalid_token' || (e.status === 400 && !e.error?.errors?.length && !e.error?.error)) {
        this.error.set(e.error?.error ?? 'This reset link is invalid or has expired.');
        this.linkInvalid.set(true);
      } else {
        this.error.set(extractAuthError(err));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
