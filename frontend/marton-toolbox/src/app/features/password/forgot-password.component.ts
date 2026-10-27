import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
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
      this.error.set('Something went wrong. Please check the email address and try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
