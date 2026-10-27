import { Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface OrderConfirmation { state: 'Pending' | 'Completed' | 'Failed'; licenseGranted: boolean; }

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 10;

@Component({
  standalone: true,
  imports: [RouterLink],
  styles: [`.lead{margin-bottom:18px}.primary,.secondary{margin:0 0 32px}`],
  template: `<section class="page tool-page">
    <p class="eyebrow">PAYMENT STATUS</p>
    @if (status() === 'checking') { <h1>Waiting for confirmation…</h1><p class="lead">We'll unlock your account automatically once the payment is confirmed.</p> }
    @if (status() === 'completed') { <h1>Payment successful</h1><p class="lead">Your license is active. Enjoy the toolbox.</p><a class="primary" routerLink="/dashboard">Go to dashboard</a> }
    @if (status() === 'failed') { <h1>Payment not successful</h1><p class="lead">The payment wasn't completed, so your account hasn't been charged or unlocked.</p><a class="primary" routerLink="/billing">Try again</a> }
    @if (status() === 'timeout') { <h1>Still waiting</h1><p class="lead">Confirmation can take a little while. Check back later, or try again now.</p><button class="secondary" (click)="retry()">Check again</button> }
  </section>`
})
export class CheckoutResultComponent implements OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private timer?: ReturnType<typeof setTimeout>;
  status = signal<'checking' | 'completed' | 'failed' | 'timeout'>('checking');
  orderId = signal('');
  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const orderId = params.get('orderId');
    if (!orderId) { this.router.navigateByUrl('/billing'); return; }
    this.orderId.set(orderId);
    this.poll(orderId, 0);
  }

  retry() {
    this.status.set('checking');
    this.poll(this.orderId(), 0);
  }

  private async poll(orderId: string, attempt: number) {
    try {
      const res = await firstValueFrom(this.http.post<{ data: OrderConfirmation }>(`/api/payments/checkout/${orderId}/confirm`, {}));
      if (res.data.state === 'Completed') { this.status.set('completed'); return; }
      if (res.data.state === 'Failed') { this.status.set('failed'); return; }
    } catch {
      // keep polling; a transient error shouldn't fail the whole flow
    }
    if (attempt + 1 >= MAX_ATTEMPTS) { this.status.set('timeout'); return; }
    this.timer = setTimeout(() => this.poll(orderId, attempt + 1), POLL_INTERVAL_MS);
  }

  ngOnDestroy() { if (this.timer) clearTimeout(this.timer); }
}
