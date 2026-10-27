import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ShopOrder, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, DatePipe],
  template: `<section class="page">
    <p class="eyebrow">Shop</p>
    <h1>My orders</h1>
    @if (error()) { <p class="error-text">{{ error() }}</p> }
    @if (loaded() && !orders().length) {
      <div class="empty-state">
        <span class="tool-icon"><mtb-icon name="package" /></span>
        <h3>No orders yet</h3>
        <a class="primary" routerLink="/shop">Visit the shop</a>
      </div>
    }
    <div class="order-list">
      @for (o of orders(); track o.id) {
        <a class="panel order-row" [routerLink]="['/shop/orders', o.id]">
          <div>
            <strong>Order {{ o.id.replace('-', '').slice(0, 8).toUpperCase() }}</strong>
            <span>{{ o.createdAt | date: 'd MMM y, HH:mm' }} · {{ itemCount(o) }} {{ itemCount(o) === 1 ? 'item' : 'items' }}</span>
          </div>
          <span class="status-pill" [attr.data-status]="statusKey(o)">{{ statusLabel(o) }}</span>
          <strong>{{ money(o.amount, o.currency) }}</strong>
          <mtb-icon name="arrow" />
        </a>
      }
    </div>
  </section>`
})
export class ShopOrdersComponent {
  private http = inject(HttpClient);
  orders = signal<ShopOrder[]>([]);
  loaded = signal(false);
  error = signal('');
  money = money;

  constructor() {
    firstValueFrom(this.http.get<{ data: ShopOrder[] }>('/api/shop/orders'))
      .then(res => this.orders.set(res.data))
      .catch(() => this.error.set('Could not load your orders.'))
      .finally(() => this.loaded.set(true));
  }

  itemCount(o: ShopOrder) { return o.items.reduce((n, i) => n + i.quantity, 0); }
  statusKey(o: ShopOrder) { return o.shippedAt ? 'shipped' : o.status.toLowerCase(); }
  statusLabel(o: ShopOrder) { return o.shippedAt ? 'Shipped' : { Paid: 'Paid', Pending: 'Awaiting payment', Failed: 'Not paid' }[o.status]; }
}
