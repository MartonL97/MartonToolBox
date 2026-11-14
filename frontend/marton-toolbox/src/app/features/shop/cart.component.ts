import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CartService, lineKey, money } from '../../core/shop/cart.service';
import { Easybox, openEasyboxMap } from '../../core/shop/easybox-map';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

type ShippingField = 'name' | 'phone' | 'address' | 'city' | 'county' | 'postalCode';
const SHIPPING_KEY = 'mtb_shipping';
const DELIVERY_KEY = 'mtb_delivery';
type Delivery = 'address' | 'easybox';
type Payment = 'Card' | 'CashOnDelivery';

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
})
export class CartComponent {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  cart = inject(CartService);
  private i18n = inject(I18nService);
  money = money;
  busy = signal(false);
  error = signal('');
  shipping = signal<Record<ShippingField, string>>(loadShipping());
  delivery = signal<Delivery>(loadDelivery().delivery);
  easybox = signal<Easybox | null>(loadDelivery().easybox);
  mapLoading = signal(false);
  payment = signal<Payment>(loadDelivery().payment);
  /** Pay on delivery is for courier delivery to an address only; easybox orders are paid online. */
  cashOnDelivery = computed(() => !this.easyboxOn() && this.payment() === 'CashOnDelivery');
  /** Easybox delivery is offered only when the shop has Sameday's map configured. */
  easyboxOn = computed(() => this.delivery() === 'easybox' && !!this.cart.catalog()?.easybox);
  shippingCost = computed(() => this.cart.shippingFor(this.cart.subtotal()));
  total = computed(() => this.cart.subtotal() + this.shippingCost());
  freeShippingGap = computed(() => {
    const c = this.cart.catalog();
    return c && this.shippingCost() > 0 ? c.freeShippingOver - this.cart.subtotal() : 0;
  });
  formValid = computed(() => {
    const s = this.shipping();
    const contact = s.name.trim().length >= 2 && s.phone.replace(/\D/g, '').length >= 6;
    if (this.easyboxOn()) return contact && !!this.easybox();
    return (
      contact && s.address.trim().length >= 5 && s.city.trim().length >= 2 && s.county.trim().length >= 2 && s.postalCode.trim().length >= 4
    );
  });

  constructor() {
    this.cart.loadCatalog().catch(() => this.error.set(this.i18n.t('cart.refresh_failed')));
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

  setPayment(payment: Payment) {
    this.payment.set(payment);
    this.saveDelivery();
  }

  setDelivery(delivery: Delivery) {
    this.delivery.set(delivery);
    this.saveDelivery();
  }

  async chooseEasybox() {
    const config = this.cart.catalog()?.easybox;
    if (!config || this.mapLoading()) return;
    this.error.set('');
    this.mapLoading.set(true);
    try {
      await openEasyboxMap(
        config,
        { lang: this.i18n.lang(), city: this.shipping().city.trim(), lockerId: this.easybox()?.lockerId },
        (locker) => {
          this.easybox.set({
            lockerId: locker.lockerId,
            name: locker.name ?? '',
            address: locker.address ?? '',
            city: locker.city ?? '',
            county: locker.county ?? '',
            postalCode: locker.postalCode ?? '',
          });
          this.saveDelivery();
        },
      );
    } catch {
      this.error.set(this.i18n.t('cart.map_failed'));
    } finally {
      this.mapLoading.set(false);
    }
  }

  private saveDelivery() {
    try {
      localStorage.setItem(DELIVERY_KEY, JSON.stringify({ delivery: this.delivery(), easybox: this.easybox(), payment: this.payment() }));
    } catch {
      /* not critical */
    }
  }

  /** What is sent as the shipping address: the typed one, or the easybox's with the buyer's name and phone. */
  private shippingBody() {
    const s = this.shipping();
    const box = this.easybox();
    if (!this.easyboxOn() || !box) return s;
    return {
      name: s.name,
      phone: s.phone,
      address: box.address,
      city: box.city,
      county: box.county,
      postalCode: box.postalCode,
      lockerId: box.lockerId,
      lockerName: box.name,
    };
  }

  async checkout(event?: Event) {
    event?.preventDefault();
    if (!this.auth.isAuthenticated() || !this.formValid() || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const body = {
        items: this.cart.lines().map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        shipping: this.shippingBody(),
        paymentMethod: this.cashOnDelivery() ? 'CashOnDelivery' : 'Card',
      };
      const res = await firstValueFrom(this.http.post<{ data: { orderId: string; checkoutUrl: string } }>('/api/shop/orders', body));
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      const e = err as HttpErrorResponse;
      this.error.set(
        e.error?.error ? this.i18n.server(e.error.error) : this.i18n.t(e.status === 400 ? 'cart.check_details' : 'cart.checkout_failed'),
      );
      this.busy.set(false);
      this.cart.loadCatalog().catch(() => {});
    }
  }
}

function loadDelivery(): { delivery: Delivery; easybox: Easybox | null; payment: Payment } {
  try {
    const saved = JSON.parse(localStorage.getItem(DELIVERY_KEY) ?? '{}');
    return {
      delivery: saved.delivery === 'easybox' ? 'easybox' : 'address',
      easybox: saved.easybox?.lockerId ? saved.easybox : null,
      payment: saved.payment === 'CashOnDelivery' ? 'CashOnDelivery' : 'Card',
    };
  } catch {
    return { delivery: 'address', easybox: null, payment: 'Card' };
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
