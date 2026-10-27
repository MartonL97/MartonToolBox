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
  templateUrl: './shop-order.component.html',
  styleUrl: './shop-order.component.scss',
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

  constructor() {
    this.poll(0);
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
      if (res.data.status === 'Failed') return;
    } catch {
      if (!this.order()) {
        this.error.set("We couldn't find this order.");
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
