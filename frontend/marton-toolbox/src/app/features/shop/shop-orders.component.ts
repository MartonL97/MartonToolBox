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
  templateUrl: './shop-orders.component.html',
  styleUrl: './shop-orders.component.scss',
})
export class ShopOrdersComponent {
  private http = inject(HttpClient);
  orders = signal<ShopOrder[]>([]);
  loaded = signal(false);
  error = signal('');
  money = money;

  constructor() {
    firstValueFrom(this.http.get<{ data: ShopOrder[] }>('/api/shop/orders'))
      .then((res) => this.orders.set(res.data))
      .catch(() => this.error.set('Could not load your orders.'))
      .finally(() => this.loaded.set(true));
  }

  itemCount(o: ShopOrder) {
    return o.items.reduce((n, i) => n + i.quantity, 0);
  }
  statusKey(o: ShopOrder) {
    return o.shippedAt ? 'shipped' : o.status.toLowerCase();
  }
  statusLabel(o: ShopOrder) {
    return o.shippedAt ? 'Shipped' : { Paid: 'Paid', Pending: 'Awaiting payment', Failed: 'Not paid' }[o.status];
  }
}
