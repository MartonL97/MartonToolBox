import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, extractAuthError } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
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
    if (this.password() !== this.confirm()) {
      this.error.set(this.i18n.t('auth.mismatch'));
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      const res = await this.auth.register(this.displayName(), this.email(), this.password(), this.confirm());
      this.emailSent.set(res.emailSent);
      this.sentTo.set(res.email);
    } catch (err) {
      this.error.set(extractAuthError(err, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }

  async resend() {
    this.resending.set(true);
    try {
      await this.auth.resendConfirmation(this.sentTo());
      this.resent.set(true);
    } catch {
      /* the endpoint always succeeds unless the network fails; let the user retry */
    } finally {
      this.resending.set(false);
    }
  }
}
