import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, extractAuthError, safeReturnUrl } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
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
    try {
      await this.auth.resendConfirmation(this.email());
      this.resent.set(true);
    } catch {
      /* network error: allow another try */
    } finally {
      this.resending.set(false);
    }
  }
}
