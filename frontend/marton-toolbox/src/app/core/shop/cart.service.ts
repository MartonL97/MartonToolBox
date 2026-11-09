import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ShopSize {
  id: string;
  size: string;
  stock: number;
}
/** stock is the total across sizes when the product has sizes. */
export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  stock: number;
  sizes: ShopSize[];
}
export interface ShopCatalog {
  products: ShopProduct[];
  shippingCost: number;
  freeShippingOver: number;
  currency: string;
}
export interface CartLine {
  productId: string;
  variantId: string | null;
  size: string | null;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}
export interface ShopOrder {
  id: string;
  /** CancelRequested: the buyer asked to cancel an unpaid order; Cancelled: an admin did. */
  status: 'Pending' | 'Paid' | 'Failed' | 'CancelRequested' | 'Cancelled';
  amount: number;
  shippingCost: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  preparedAt: string | null;
  registeredAt: string | null;
  shippedAt: string | null;
  atCourierDepotAt: string | null;
  outForDeliveryAt: string | null;
  /** Set when an admin marks the order as received; it is finished from then on. */
  deliveredAt: string | null;
  /** The courier's AWB, once an admin has added it. */
  trackingNumber: string | null;
  items: { productName: string; size: string | null; unitPrice: number; quantity: number }[];
}

export const ORDER_STEPS = ['Placed', 'Paid', 'Prepared', 'Registered', 'Shipped', 'AtCourierDepot', 'OutForDelivery', 'Delivered'] as const;
export type OrderStep = (typeof ORDER_STEPS)[number];
export interface OrderTimelineStep {
  key: OrderStep;
  at: string | null;
  done: boolean;
}

/** Every delivery step in order. Orders from before a step existed have no date for it, but still count it as done. */
export function orderTimeline(o: ShopOrder): OrderTimelineStep[] {
  const dates = [o.createdAt, o.paidAt, o.preparedAt, o.registeredAt, o.shippedAt, o.atCourierDepotAt, o.outForDeliveryAt, o.deliveredAt];
  const latest = Math.max(o.status === 'Paid' ? 1 : 0, dates.reduce((last, at, i) => (at ? i : last), 0));
  return ORDER_STEPS.map((key, i) => ({ key, at: dates[i] ?? null, done: i <= latest }));
}

/** The step an admin can move a paid order to next; null when it's finished or unpaid. Saving an AWB sets Registered. */
export function nextOrderStep(o: ShopOrder): OrderStep | null {
  return o.status === 'Paid' ? (orderTimeline(o).find((s) => !s.done && s.key !== 'Registered')?.key ?? null) : null;
}

/** The stage to show for an order: delivery progress once paid, otherwise its payment status. */
export function orderStage(o: ShopOrder): string {
  if (o.status !== 'Paid') return o.status;
  const current = orderTimeline(o).filter((s) => s.done).pop()!.key;
  return current === 'Delivered' ? 'Finished' : current;
}

const STORAGE_KEY = 'mtb_cart';
const MAX_QTY = 99;

/** One cart line per product + size. */
export function lineKey(l: { productId: string; variantId: string | null }) {
  return `${l.productId}:${l.variantId ?? ''}`;
}

/** The cart lives in localStorage so it survives reloads and logging in. Prices here are for display only; the server re-prices every order. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private http = inject(HttpClient);
  readonly lines = signal<CartLine[]>(load());
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly subtotal = computed(() => this.lines().reduce((sum, l) => sum + l.price * l.quantity, 0));
  readonly catalog = signal<ShopCatalog | null>(null);

  async loadCatalog(): Promise<ShopCatalog> {
    const res = await firstValueFrom(this.http.get<{ data: ShopCatalog }>('/api/shop/products'));
    this.catalog.set(res.data);
    // Refresh cached names/prices; drop lines whose product or size no longer exists.
    const byId = new Map(res.data.products.map((p) => [p.id, p]));
    this.save(
      this.lines().flatMap((l) => {
        const p = byId.get(l.productId);
        if (!p) return [];
        const variant = p.sizes.find((s) => s.id === l.variantId);
        if (p.sizes.length && !variant) return [];
        const stock = variant ? variant.stock : p.stock;
        return [
          {
            ...l,
            size: variant?.size ?? null,
            name: p.name,
            price: p.price,
            imageUrl: p.imageUrl,
            quantity: Math.min(l.quantity, Math.max(stock, 1)),
          },
        ];
      }),
    );
    return res.data;
  }

  /** Stock available for a cart line (its size's stock for sized products). */
  stockOf(line: { productId: string; variantId: string | null }): number {
    const p = this.catalog()?.products.find((x) => x.id === line.productId);
    if (!p) return MAX_QTY;
    return line.variantId ? (p.sizes.find((s) => s.id === line.variantId)?.stock ?? 0) : p.stock;
  }

  quantityInCart(productId: string, variantId: string | null) {
    return this.lines().find((l) => lineKey(l) === lineKey({ productId, variantId }))?.quantity ?? 0;
  }

  add(product: ShopProduct, size: ShopSize | null, quantity = 1) {
    const variantId = size?.id ?? null;
    const key = lineKey({ productId: product.id, variantId });
    const limit = Math.min(MAX_QTY, size ? size.stock : product.stock);
    const existing = this.lines().find((l) => lineKey(l) === key);
    if (existing) this.setQuantity(key, Math.min(existing.quantity + quantity, limit));
    else
      this.save([
        ...this.lines(),
        {
          productId: product.id,
          variantId,
          size: size?.size ?? null,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: Math.min(quantity, limit),
        },
      ]);
  }

  setQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      this.remove(key);
      return;
    }
    this.save(this.lines().map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(quantity, MAX_QTY) } : l)));
  }

  remove(key: string) {
    this.save(this.lines().filter((l) => lineKey(l) !== key));
  }

  clear() {
    this.save([]);
  }

  shippingFor(subtotal: number): number {
    const c = this.catalog();
    if (!c || subtotal === 0) return 0;
    return subtotal >= c.freeShippingOver ? 0 : c.shippingCost;
  }

  private save(lines: CartLine[]) {
    this.lines.set(lines);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage full or blocked: cart still works in memory */
    }
  }
}

function load(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((l) => l && typeof l.productId === 'string' && l.quantity > 0).map((l) => ({ variantId: null, size: null, ...l }))
      : [];
  } catch {
    return [];
  }
}

/** "1234.5" -> "1.234,50 RON" (Romanian formatting). */
export function money(amount: number, currency = 'RON') {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' ' + currency;
}
