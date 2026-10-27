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
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
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
    return (
      s.name.trim().length >= 2 &&
      s.phone.replace(/\D/g, '').length >= 6 &&
      s.address.trim().length >= 5 &&
      s.city.trim().length >= 2 &&
      s.county.trim().length >= 2 &&
      s.postalCode.trim().length >= 4
    );
  });

  constructor() {
    this.cart.loadCatalog().catch(() => this.error.set('Could not refresh prices. Please reload the page.'));
    this.prefillFromProfile();
  }

  /** A blank shipping form is filled from the account profile; anything typed (or remembered) wins. */
  private async prefillFromProfile() {
    if (!this.auth.isAuthenticated() || Object.values(this.shipping()).some((v) => v.trim())) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{
          data: {
            profile: {
              displayName: string;
              phone: string | null;
              address: string | null;
              city: string | null;
              county: string | null;
              postalCode: string | null;
            };
          };
        }>('/api/account'),
      );
      const p = res.data.profile;
      if (Object.values(this.shipping()).some((v) => v.trim())) return; // the user started typing meanwhile
      this.shipping.set({
        name: p.displayName ?? '',
        phone: p.phone ?? '',
        address: p.address ?? '',
        city: p.city ?? '',
        county: p.county ?? '',
        postalCode: p.postalCode ?? '',
      });
    } catch {
      /* not critical: the form just stays empty */
    }
  }

  key = lineKey;

  set(field: ShippingField, event: Event) {
    this.shipping.update((s) => ({ ...s, [field]: (event.target as HTMLInputElement).value }));
    try {
      localStorage.setItem(SHIPPING_KEY, JSON.stringify(this.shipping()));
    } catch {
      /* not critical */
    }
  }

  async checkout(event?: Event) {
    event?.preventDefault();
    if (!this.auth.isAuthenticated() || !this.formValid() || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const body = {
        items: this.cart.lines().map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        shipping: this.shipping(),
      };
      const res = await firstValueFrom(this.http.post<{ data: { orderId: string; checkoutUrl: string } }>('/api/shop/orders', body));
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.error.set(
        e.error?.error ?? (e.status === 400 ? 'Please check the shipping details.' : 'Could not start checkout. Please try again.'),
      );
      this.busy.set(false);
      this.cart.loadCatalog().catch(() => {});
    }
  }
}

function loadShipping(): Record<ShippingField, string> {
  const empty = { name: '', phone: '', address: '', city: '', county: '', postalCode: '' };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(SHIPPING_KEY) ?? '{}') };
  } catch {
    return empty;
  }
}
