import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ShopOrder, money, orderStage } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './shop-orders.component.html',
  styleUrl: './shop-orders.component.scss',
})
export class ShopOrdersComponent {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  orders = signal<ShopOrder[]>([]);
  loaded = signal(false);
  error = signal('');
  money = money;

  constructor() {
    firstValueFrom(this.http.get<{ data: ShopOrder[] }>('/api/shop/orders'))
      .then((res) => this.orders.set(res.data))
      .catch(() => this.error.set(this.i18n.t('orders.load_failed')))
      .finally(() => this.loaded.set(true));
  }

  itemCount(o: ShopOrder) {
    return o.items.reduce((n, i) => n + i.quantity, 0);
  }
  statusKey(o: ShopOrder) {
    return orderStage(o).toLowerCase();
  }
  statusLabel(o: ShopOrder) {
    return this.i18n.t(`order.status.${orderStage(o)}`);
  }
}
