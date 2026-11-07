import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

/** Target of the link in the password reset email. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18nService);
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
      this.error.set(this.i18n.t('reset.incomplete'));
      this.linkInvalid.set(true);
    }
  }

  async submit(event: Event) {
    event.preventDefault();
    if (this.password() !== this.confirm()) {
      this.error.set(this.i18n.t('auth.mismatch'));
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
        this.error.set(this.i18n.server(e.error?.error, 'reset.invalid'));
        this.linkInvalid.set(true);
      } else {
        this.error.set(extractAuthError(err, this.i18n));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
