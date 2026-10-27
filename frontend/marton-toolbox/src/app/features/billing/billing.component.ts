import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IconComponent } from '../../core/ui/icon.component';

interface CheckoutSession {
  orderId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
}

export interface License {
  licenseKey: string;
  product: string;
  status: string;
  purchasedAt: string;
  expiresAt: string | null;
}

@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent {
  private http = inject(HttpClient);
  /** Until the account check finishes we show neither the license nor the pay button. */
  checking = signal(true);
  license = signal<License | null>(null);
  loading = signal(false);
  error = signal('');
  copied = signal(false);

  constructor() {
    firstValueFrom(this.http.get<{ data: { license: License | null } }>('/api/account'))
      .then((res) => this.license.set(res.data.license))
      .catch(() => this.license.set(null)) // can't tell: fall back to offering the purchase
      .finally(() => this.checking.set(false));
  }

  async startCheckout() {
    this.error.set('');
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.http.post<{ data: CheckoutSession }>('/api/payments/checkout', {}));
      // Hand over to the payment page; it sends the browser back to /checkout/result afterwards.
      window.location.href = res.data.checkoutUrl;
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not start checkout. Please try again.');
      this.loading.set(false);
    }
  }

  async copyKey() {
    const key = this.license()?.licenseKey;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard blocked: the key is still visible and selectable */
    }
  }
}
