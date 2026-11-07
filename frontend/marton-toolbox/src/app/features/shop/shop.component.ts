import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService, ShopProduct, ShopSize, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
})
export class ShopComponent {
  cart = inject(CartService);
  private i18n = inject(I18nService);
  products = signal<ShopProduct[]>([]);
  loading = signal(true);
  error = signal('');
  justAdded = signal<string | null>(null);
  /** Selected size per product id. */
  private sizes = signal<Record<string, ShopSize>>({});
  money = money;
  productQuery = signal('');
  inStockOnly = signal(false);
  sizeFilter = signal('');
  sort = signal<'featured' | 'price-asc' | 'price-desc'>('featured');
  /** Every size offered by some product, in the order the catalog lists them. */
  sizeOptions = computed(() => [...new Set(this.products().flatMap((p) => p.sizes.map((s) => s.size)))]);
  matchingProducts = computed(() => {
    const q = this.productQuery().trim().toLowerCase();
    const size = this.sizeFilter();
    const inStockOnly = this.inStockOnly();
    const list = this.products().filter((p) => {
      if (q && !(p.name + ' ' + p.description).toLowerCase().includes(q)) return false;
      if (size) {
        const s = p.sizes.find((x) => x.size === size);
        if (!s || (inStockOnly && s.stock === 0)) return false;
      }
      return !inStockOnly || p.stock > 0;
    });
    const sort = this.sort();
    // "Featured" keeps the catalog order.
    if (sort === 'featured') return list;
    return list.sort((a, b) => (sort === 'price-asc' ? a.price - b.price : b.price - a.price));
  });
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cart
      .loadCatalog()
      .then((c) => this.products.set(c.products))
      .catch(() => this.error.set(this.i18n.t('shop.unavailable')))
      .finally(() => this.loading.set(false));
  }

  clearFilters() {
    this.productQuery.set('');
    this.inStockOnly.set(false);
    this.sizeFilter.set('');
    this.sort.set('featured');
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
