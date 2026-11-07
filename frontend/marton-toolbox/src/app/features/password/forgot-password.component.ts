import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
  email = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '');
  loading = signal(false);
  sent = signal(false);
  error = signal('');

  async submit(event: Event) {
    event.preventDefault();
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.forgotPassword(this.email().trim());
      this.sent.set(true);
    } catch {
      this.error.set(this.i18n.t('forgot.failed'));
    } finally {
      this.loading.set(false);
    }
  }
}
