import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface CheckoutSession { orderId: string; checkoutUrl: string; amount: number; currency: string; }

@Component({
  standalone: true,
  template: `<section class="page tool-page">
    <p class="eyebrow">UNLOCK MARTONTOOLBOX</p>
    <h1>One-time payment, lifetime access</h1>
    <p class="lead">A single one-time payment unlocks every tool for your account, for good.</p>
    @if (error()) { <p class="error-text">{{ error() }}</p> }
    <button class="primary" (click)="startCheckout()" [disabled]="loading()">{{ loading() ? 'Opening payment…' : 'Pay now' }}</button>
  </section>`
})
export class BillingComponent {
  private http = inject(HttpClient);
  loading = signal(false);
  error = signal('');

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
}
