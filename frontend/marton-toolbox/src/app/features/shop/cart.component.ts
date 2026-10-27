import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CartService, lineKey, money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';

type ShippingField = 'name' | 'phone' | 'address' | 'city' | 'county' | 'postalCode';
const SHIPPING_KEY = 'mtb_shipping';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page">
    <p class="eyebrow">Shop</p>
    <h1>Your cart</h1>

    @if (!cart.lines().length) {
      <div class="empty-state">
        <span class="tool-icon"><mtb-icon name="cart" /></span>
        <h3>Your cart is empty</h3>
        <p class="lead">Browse the shop and add something you like.</p>
        <a class="primary" routerLink="/shop">Go to shop</a>
      </div>
    } @else {
      <div class="checkout">
        <div class="checkout-main">
          <div class="panel">
            <h3>Items</h3>
            @for (line of cart.lines(); track key(line)) {
              <div class="cart-line">
                <div class="cart-thumb" [class.photo]="line.imageUrl">@if (line.imageUrl) { <img [src]="line.imageUrl" [alt]="line.name"> } @else { <mtb-icon name="package" /> }</div>
                <div class="cart-info"><strong>{{ line.name }}</strong><span>@if (line.size) { Size {{ line.size }} · }{{ money(line.price) }} each</span></div>
                <div class="stepper">
                  <button title="Decrease" (click)="cart.setQuantity(key(line), line.quantity - 1)"><mtb-icon name="minus" /></button>
                  <span>{{ line.quantity }}</span>
                  <button title="Increase" [disabled]="line.quantity >= cart.stockOf(line)" (click)="cart.setQuantity(key(line), line.quantity + 1)"><mtb-icon name="plus" /></button>
                </div>
                <strong class="line-total">{{ money(line.price * line.quantity) }}</strong>
                <button class="icon-button" title="Remove" (click)="cart.remove(key(line))"><mtb-icon name="trash" /></button>
              </div>
            }
          </div>

          <form class="panel" (submit)="checkout($event)">
            <h3><mtb-icon name="truck" />Shipping address</h3>
            <div class="form-grid">
              <label class="span-2">Full name<input autocomplete="name" [value]="shipping().name" (input)="set('name', $event)" required></label>
              <label>Phone<input type="tel" autocomplete="tel" placeholder="07xx xxx xxx" [value]="shipping().phone" (input)="set('phone', $event)" required></label>
              <label>Postal code<input autocomplete="postal-code" [value]="shipping().postalCode" (input)="set('postalCode', $event)" required></label>
              <label class="span-2">Street address<input autocomplete="street-address" placeholder="Street, number, building, apartment" [value]="shipping().address" (input)="set('address', $event)" required></label>
              <label>City<input autocomplete="address-level2" [value]="shipping().city" (input)="set('city', $event)" required></label>
              <label>County (județ)<input autocomplete="address-level1" [value]="shipping().county" (input)="set('county', $event)" required></label>
            </div>
            <button type="submit" hidden></button>
          </form>
        </div>

        <div class="summary panel">
          <h3>Order summary</h3>
          <div class="summary-row"><span>Subtotal</span><span>{{ money(cart.subtotal()) }}</span></div>
          <div class="summary-row"><span>Shipping</span><span>{{ shippingCost() === 0 ? 'Free' : money(shippingCost()) }}</span></div>
          @if (freeShippingGap() > 0) { <p class="hint-box">Add {{ money(freeShippingGap()) }} more for free shipping.</p> }
          <div class="summary-row total"><span>Total</span><span>{{ money(total()) }}</span></div>
          @if (error()) { <p class="error-text">{{ error() }}</p> }
          @if (auth.isAuthenticated()) {
            <button class="primary block" [disabled]="busy() || !formValid()" (click)="checkout()">{{ busy() ? 'Redirecting to PayU…' : 'Pay ' + money(total()) + ' with PayU' }}</button>
            @if (!formValid()) { <p class="hint">Fill in the shipping address to continue.</p> }
          } @else {
            <a class="primary block" routerLink="/login" [queryParams]="{ returnUrl: '/shop/cart' }">Log in to check out</a>
          }
          <p class="hint secure"><mtb-icon name="shield" />Secure card payment by PayU.</p>
        </div>
      </div>
    }
  </section>`
})
export class CartComponent {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  cart = inject(CartService);
  money = money;
  busy = signal(false);
  error = signal('');
  shipping = signal<Record<ShippingField, string>>(loadShipping());
  shippingCost = computed(() => this.cart.shippingFor(this.cart.subtotal()));
  total = computed(() => this.cart.subtotal() + this.shippingCost());
  freeShippingGap = computed(() => {
    const c = this.cart.catalog();
    return c && this.shippingCost() > 0 ? c.freeShippingOver - this.cart.subtotal() : 0;
  });
  formValid = computed(() => {
    const s = this.shipping();
    return s.name.trim().length >= 2 && s.phone.replace(/\D/g, '').length >= 6 && s.address.trim().length >= 5
      && s.city.trim().length >= 2 && s.county.trim().length >= 2 && s.postalCode.trim().length >= 4;
  });

  constructor() {
    this.cart.loadCatalog().catch(() => this.error.set('Could not refresh prices. Please reload the page.'));
    this.prefillFromProfile();
  }

  /** A blank shipping form is filled from the account profile; anything typed (or remembered) wins. */
  private async prefillFromProfile() {
    if (!this.auth.isAuthenticated() || Object.values(this.shipping()).some(v => v.trim())) return;
    try {
      const res = await firstValueFrom(this.http.get<{ data: { profile: { displayName: string; phone: string | null; address: string | null; city: string | null; county: string | null; postalCode: string | null } } }>('/api/account'));
      const p = res.data.profile;
      if (Object.values(this.shipping()).some(v => v.trim())) return; // the user started typing meanwhile
      this.shipping.set({ name: p.displayName ?? '', phone: p.phone ?? '', address: p.address ?? '', city: p.city ?? '', county: p.county ?? '', postalCode: p.postalCode ?? '' });
    } catch { /* not critical: the form just stays empty */ }
  }

  key = lineKey;

  set(field: ShippingField, event: Event) {
    this.shipping.update(s => ({ ...s, [field]: (event.target as HTMLInputElement).value }));
    try { localStorage.setItem(SHIPPING_KEY, JSON.stringify(this.shipping())); } catch { /* not critical */ }
  }

  async checkout(event?: Event) {
    event?.preventDefault();
    if (!this.auth.isAuthenticated() || !this.formValid() || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const body = { items: this.cart.lines().map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })), shipping: this.shipping() };
      const res = await firstValueFrom(this.http.post<{ data: { orderId: string; checkoutUrl: string } }>('/api/shop/orders', body));
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.error.set(e.error?.error ?? (e.status === 400 ? 'Please check the shipping details.' : 'Could not start checkout. Please try again.'));
      this.busy.set(false);
      this.cart.loadCatalog().catch(() => {});
    }
  }
}

function loadShipping(): Record<ShippingField, string> {
  const empty = { name: '', phone: '', address: '', city: '', county: '', postalCode: '' };
  try { return { ...empty, ...JSON.parse(localStorage.getItem(SHIPPING_KEY) ?? '{}') }; } catch { return empty; }
}
