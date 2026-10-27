import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService, ShopProduct, ShopSize, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
})
export class ShopComponent {
  cart = inject(CartService);
  products = signal<ShopProduct[]>([]);
  loading = signal(true);
  error = signal('');
  justAdded = signal<string | null>(null);
  /** Selected size per product id. */
  private sizes = signal<Record<string, ShopSize>>({});
  money = money;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cart
      .loadCatalog()
      .then((c) => this.products.set(c.products))
      .catch(() => this.error.set('The shop is unavailable right now. Please try again later.'))
      .finally(() => this.loading.set(false));
  }

  selected(product: ShopProduct): ShopSize | null {
    return this.sizes()[product.id] ?? null;
  }

  pick(product: ShopProduct, size: ShopSize) {
    this.sizes.update((s) => ({ ...s, [product.id]: size }));
  }

  canAdd(product: ShopProduct) {
    if (!product.sizes.length) return product.stock > this.cart.quantityInCart(product.id, null);
    const s = this.selected(product);
    return !!s && s.stock > this.cart.quantityInCart(product.id, s.id);
  }

  add(product: ShopProduct) {
    this.cart.add(product, product.sizes.length ? this.selected(product) : null);
    this.justAdded.set(product.id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.justAdded.set(null), 1400);
  }
}
