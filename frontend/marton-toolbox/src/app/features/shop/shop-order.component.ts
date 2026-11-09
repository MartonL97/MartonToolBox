import { Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartService, ShopOrder, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';
import { OrderTimelineComponent } from './order-timeline.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 10;

/** PayU sends the buyer back here; we poll until PayU reports a final status. */
@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, OrderTimelineComponent, ...I18N],
  templateUrl: './shop-order.component.html',
  styleUrl: './shop-order.component.scss',
})
export class ShopOrderComponent implements OnDestroy {
  private http = inject(HttpClient);
  private cart = inject(CartService);
  private i18n = inject(I18nService);
  private orderId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private timer?: ReturnType<typeof setTimeout>;
  order = signal<ShopOrder | null>(null);
  error = signal('');
  timedOut = signal(false);
  confirmCancel = signal(false);
  cancelling = signal(false);
  shortId = signal(this.orderId.replace(/-/g, '').slice(0, 8).toUpperCase());
  money = money;

  constructor() {
    this.poll(0);
  }

  /** Asks the shop to cancel this unpaid order; an admin confirms it. */
  async requestCancel() {
    this.error.set('');
    this.cancelling.set(true);
    try {
      const res = await firstValueFrom(this.http.post<{ data: ShopOrder }>(`/api/shop/orders/${this.orderId}/cancel`, {}));
      clearTimeout(this.timer);
      this.order.set(res.data);
      this.confirmCancel.set(false);
    } catch (err) {
      this.error.set(this.i18n.server((err as HttpErrorResponse).error?.error, 'order.cancel_failed'));
    } finally {
      this.cancelling.set(false);
    }
  }

  retry() {
    this.timedOut.set(false);
    this.poll(0);
  }

  private async poll(attempt: number) {
    try {
      const res = await firstValueFrom(this.http.post<{ data: ShopOrder }>(`/api/shop/orders/${this.orderId}/confirm`, {}));
      this.order.set(res.data);
      if (res.data.status === 'Paid') {
        this.cart.clear();
        return;
      }
      if (res.data.status !== 'Pending') return;
    } catch {
      if (!this.order()) {
        this.error.set(this.i18n.t('order.not_found'));
        return;
      }
    }
    if (attempt + 1 >= MAX_ATTEMPTS) {
      this.timedOut.set(true);
      return;
    }
    this.timer = setTimeout(() => this.poll(attempt + 1), POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }
}
