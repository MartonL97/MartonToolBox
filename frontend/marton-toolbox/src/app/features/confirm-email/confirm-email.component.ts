import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

/** Target of the link in the confirmation email: activates the account, signs in, and moves on. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './confirm-email.component.html',
  styleUrl: './confirm-email.component.scss',
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
    const userId = params.get('userId'),
      token = params.get('token');
    if (!userId || !token) {
      this.fail('This confirmation link is incomplete. Make sure you copied the whole link.');
      return;
    }
    this.auth
      .confirmEmail(userId, token)
      .then(() => {
        this.state.set('done');
        setTimeout(() => this.router.navigateByUrl('/dashboard'), 2500);
      })
      .catch((err: HttpErrorResponse) => {
        if (err.status === 409) this.state.set('already');
        else if (err.status === 0 || err.status >= 500) this.fail("We couldn't reach the server. Please try the link again in a moment.");
        else this.fail(err.error?.error ?? 'This confirmation link is invalid or has expired. Enter your email to get a new one.');
      });
  }

  async resend(event: Event) {
    event.preventDefault();
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

  private fail(message: string) {
    this.error.set(message);
    this.state.set('failed');
  }
}
