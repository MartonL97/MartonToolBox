import { Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartService, ShopOrder, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 10;

/** PayU sends the buyer back here; we poll until PayU reports a final status. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page">
    <p class="eyebrow">Order {{ shortId() }}</p>
    @if (order(); as o) {
      @if (o.status === 'Paid') {
        <div class="status-banner success"><mtb-icon name="check" /><div><h1>Thank you for your order!</h1><p class="lead">Payment received. @if (o.shippedAt) { Your order has shipped. } @else { We'll pack it and ship it soon. }</p></div></div>
      } @else if (o.status === 'Failed') {
        <div class="status-banner error"><mtb-icon name="cart" /><div><h1>Payment not completed</h1><p class="lead">You haven't been charged. Your cart is still saved.</p></div></div>
      } @else {
        <div class="status-banner"><span class="spinner"></span><div><h1>{{ timedOut() ? 'Still waiting for PayU' : 'Confirming your payment…' }}</h1><p class="lead">This usually takes a few seconds.</p></div></div>
      }

      <div class="panel order-panel">
        @for (item of o.items; track $index) {
          <div class="summary-row"><span>{{ item.quantity }} × {{ item.productName }}@if (item.size) { · size {{ item.size }} }</span><span>{{ money(item.unitPrice * item.quantity, o.currency) }}</span></div>
        }
        <div class="summary-row"><span>Shipping</span><span>{{ o.shippingCost === 0 ? 'Free' : money(o.shippingCost, o.currency) }}</span></div>
        <div class="summary-row total"><span>Total</span><span>{{ money(o.amount, o.currency) }}</span></div>
      </div>

      <div class="actions">
        @if (o.status === 'Failed') { <a class="primary" routerLink="/shop/cart">Back to cart</a> }
        @if (o.status === 'Pending' && timedOut()) { <button class="primary" (click)="retry()">Check again</button> }
        <a class="secondary" routerLink="/shop/orders">My orders</a>
        <a class="secondary" routerLink="/shop">Continue shopping</a>
      </div>
    } @else if (error()) {
      <p class="error-text">{{ error() }}</p>
    } @else {
      <div class="status-banner"><span class="spinner"></span><div><h1>Loading your order…</h1></div></div>
    }
  </section>`
})
export class ShopOrderComponent implements OnDestroy {
  private http = inject(HttpClient);
  private cart = inject(CartService);
  private orderId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private timer?: ReturnType<typeof setTimeout>;
  order = signal<ShopOrder | null>(null);
  error = signal('');
  timedOut = signal(false);
  shortId = signal(this.orderId.replace(/-/g, '').slice(0, 8).toUpperCase());
  money = money;

  constructor() { this.poll(0); }

  retry() { this.timedOut.set(false); this.poll(0); }

  private async poll(attempt: number) {
    try {
      const res = await firstValueFrom(this.http.post<{ data: ShopOrder }>(`/api/shop/orders/${this.orderId}/confirm`, {}));
      this.order.set(res.data);
      if (res.data.status === 'Paid') { this.cart.clear(); return; }
      if (res.data.status === 'Failed') return;
    } catch {
      if (!this.order()) { this.error.set('We couldn\'t find this order.'); return; }
    }
    if (attempt + 1 >= MAX_ATTEMPTS) { this.timedOut.set(true); return; }
    this.timer = setTimeout(() => this.poll(attempt + 1), POLL_INTERVAL_MS);
  }

  ngOnDestroy() { clearTimeout(this.timer); }
}
