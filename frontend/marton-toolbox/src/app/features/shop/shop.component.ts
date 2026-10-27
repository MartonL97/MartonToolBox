import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService, ShopProduct, ShopSize, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page">
    <div class="shop-header">
      <div>
        <p class="eyebrow">Shop</p>
        <h1>MartonToolBox merch</h1>
        <p class="lead">Shipped across Romania.
          @if (cart.catalog(); as c) { Free shipping on orders over {{ money(c.freeShippingOver, c.currency) }}. }
        </p>
      </div>
      <a class="secondary cart-link" routerLink="/shop/cart"><mtb-icon name="cart" />Cart @if (cart.count()) { <span class="badge">{{ cart.count() }}</span> }</a>
    </div>

    @if (error()) { <p class="error-text">{{ error() }}</p> }
    @if (loading()) { <div class="product-grid"><div class="product-card skeleton"></div></div> }

    <div class="product-grid">
      @for (product of products(); track product.id; let i = $index) {
        <article class="product-card">
          <div class="product-media" [class.photo]="product.imageUrl" [attr.data-tone]="i % 4">
            @if (product.imageUrl) { <img [src]="product.imageUrl" [alt]="product.name" loading="lazy"> } @else { <mtb-icon name="package" /> }
            @if (product.stock === 0) { <span class="stock-flag">Sold out</span> }
          </div>
          <div class="product-body">
            <h3>{{ product.name }}</h3>
            <strong class="price">{{ money(product.price, product.currency) }}</strong>
            <p>{{ product.description }}</p>

            @if (product.sizes.length) {
              <div class="size-picker">
                <div class="size-label"><span>Size</span>@if (selected(product); as s) { <strong>{{ s.size }}</strong> @if (s.stock > 0 && s.stock <= 5) { <em>Only {{ s.stock }} left</em> } }</div>
                <div class="sizes" role="radiogroup" [attr.aria-label]="'Size for ' + product.name">
                  @for (s of product.sizes; track s.id) {
                    <button type="button" role="radio" class="size" [class.active]="selected(product)?.id === s.id" [attr.aria-checked]="selected(product)?.id === s.id"
                      [disabled]="s.stock === 0" [title]="s.stock === 0 ? 'Sold out' : 'Size ' + s.size" (click)="pick(product, s)">{{ s.size }}</button>
                  }
                </div>
              </div>
            }

            <div class="product-foot">
              <button class="primary" [disabled]="!canAdd(product)" (click)="add(product)">
                @if (justAdded() === product.id) { <mtb-icon name="check" />Added to cart }
                @else if (product.sizes.length && !selected(product)) { Select a size }
                @else { <mtb-icon name="plus" />Add to cart }
              </button>
            </div>
          </div>
        </article>
      }
    </div>

    @if (cart.count()) {
      <a class="cart-bar" routerLink="/shop/cart">
        <span><mtb-icon name="cart" />{{ cart.count() }} {{ cart.count() === 1 ? 'item' : 'items' }} · {{ money(cart.subtotal()) }}</span>
        <span>Go to checkout <mtb-icon name="arrow" /></span>
      </a>
    }
  </section>`
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
    this.cart.loadCatalog()
      .then(c => this.products.set(c.products))
      .catch(() => this.error.set('The shop is unavailable right now. Please try again later.'))
      .finally(() => this.loading.set(false));
  }

  selected(product: ShopProduct): ShopSize | null { return this.sizes()[product.id] ?? null; }

  pick(product: ShopProduct, size: ShopSize) { this.sizes.update(s => ({ ...s, [product.id]: size })); }

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
