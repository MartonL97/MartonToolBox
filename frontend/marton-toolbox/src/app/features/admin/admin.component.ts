import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OrderStep, ShopOrder, money, nextOrderStep, orderStage, orderTimeline } from '../../core/shop/cart.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

interface ActiveLicense {
  id: string;
  userEmail: string;
  displayName: string;
  licenseKey: string;
  product: string;
  purchasedAt: string;
  expiresAt: string | null;
}
interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  sizes: { size: string; stock: number }[];
}
interface AdminShopOrder {
  order: ShopOrder;
  userEmail: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingCounty: string | null;
  shippingPostalCode: string | null;
}
interface InventoryRow {
  productId: string;
  variantId: string | null;
  productName: string;
  size: string | null;
  isActive: boolean;
  onHand: number;
  reserved: number;
  awaitingShipment: number;
  available: number;
}
interface Inventory {
  rows: InventoryRow[];
  lowStockThreshold: number;
  reservationMinutes: number;
}
type StockLevel = 'out' | 'low' | 'ok';
/** A product's inventory rows (one per size, or a single row without sizes). */
interface InventoryProduct {
  productId: string;
  productName: string;
  isActive: boolean;
  rows: InventoryRow[];
  available: number;
  level: StockLevel;
}
type Tab = 'orders' | 'products' | 'inventory' | 'licenses';
/** sizesText is edited as "S:20, M:15, L:0"; empty means the product has no sizes. */
type ProductForm = Omit<AdminProduct, 'id' | 'currency' | 'imageUrl' | 'sizes'> & {
  id: string | null;
  imageUrl: string;
  sizesText: string;
};

const emptyProduct = (): ProductForm => ({
  id: null,
  slug: '',
  name: '',
  description: '',
  price: 0,
  imageUrl: '',
  stock: 0,
  isActive: true,
  sortOrder: 0,
  sizesText: '',
});

/** "S:20, M:15" -> [{size:'S',stock:20},…]. Throws a readable message on bad input. */
/** A sizes entry that isn't "S:20"-shaped (shown in the admin's language). */
class SizeFormatError extends Error {
  constructor(readonly part: string) {
    super(`"${part}" should look like S:20`);
  }
}

function parseSizes(text: string): { size: string; stock: number }[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^([^:]{1,20}):\s*(\d+)$/.exec(part);
      if (!m) throw new SizeFormatError(part);
      return { size: m[1].trim().toUpperCase(), stock: Number(m[2]) };
    });
}

@Component({
  standalone: true,
  imports: [...I18N],
  styleUrl: './admin.component.scss',
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private http = inject(HttpClient);
  i18n = inject(I18nService);
  tab = signal<Tab>('orders');
  loading = signal(false);
  loaded = signal(false);
  error = signal('');
  busy = signal<string | null>(null);
  licenses = signal<ActiveLicense[]>([]);
  shopOrders = signal<AdminShopOrder[]>([]);
  products = signal<AdminProduct[]>([]);
  inventory = signal<Inventory>({ rows: [], lowStockThreshold: 0, reservationMinutes: 0 });
  /** Unsaved on-hand counts typed into the inventory table, keyed by rowKey. */
  stockEdits = signal<Record<string, number>>({});
  showOnlyAlerts = signal(false);
  /** Unsaved AWB numbers typed on the orders tab, keyed by order id. */
  trackingEdits = signal<Record<string, string>>({});
  /** What Sameday answered when an AWB was just saved, keyed by order id. */
  trackingNotes = signal<Record<string, string>>({});
  /** Rows that are out of stock or at/below the low-stock threshold. */
  stockAlerts = computed(() => this.inventory().rows.filter((r) => this.level(r) !== 'ok'));
  outOfStockCount = computed(() => this.stockAlerts().filter((r) => this.level(r) === 'out').length);
  /** Rows grouped by product, in catalog order. A product is out when nothing is left, low when any size needs restocking. */
  inventoryProducts = computed<InventoryProduct[]>(() => {
    const byId = new Map<string, InventoryProduct>();
    for (const r of this.inventory().rows) {
      let p = byId.get(r.productId);
      if (!p)
        byId.set(
          r.productId,
          (p = { productId: r.productId, productName: r.productName, isActive: r.isActive, rows: [], available: 0, level: 'ok' }),
        );
      p.rows.push(r);
      p.available += r.available;
    }
    for (const p of byId.values()) p.level = p.available <= 0 ? 'out' : p.rows.some((r) => this.level(r) !== 'ok') ? 'low' : 'ok';
    return [...byId.values()];
  });
  visibleProducts = computed(() => this.inventoryProducts().filter((p) => !this.showOnlyAlerts() || p.level !== 'ok'));
  selectedProductId = signal<string | null>(null);
  /** The product open in the editor; falls back to the first listed one. */
  selectedProduct = computed<InventoryProduct | null>(
    () => this.visibleProducts().find((p) => p.productId === this.selectedProductId()) ?? this.visibleProducts()[0] ?? null,
  );
  form = signal<ProductForm>(emptyProduct());
  /** Product, order or license id awaiting a second click to confirm deletion. */
  confirmDelete = signal<string | null>(null);
  /** Order id awaiting a second click to confirm cancelling it. */
  confirmCancel = signal<string | null>(null);
  /** Orders whose buyer asked to cancel; shown on the orders tab so they aren't missed. */
  cancelRequests = computed(() => this.shopOrders().filter((o) => o.order.status === 'CancelRequested').length);
  emptyProduct = emptyProduct;
  money = money;
  stage = orderStage;
  nextStep = nextOrderStep;

  constructor() {
    this.load();
  }

  async toggleVisible(p: AdminProduct) {
    await this.run(p.id, async () => {
      await firstValueFrom(this.http.put(`/api/admin/shop/products/${p.id}/visibility`, { isActive: !p.isActive }));
      this.products.update((list) => list.map((x) => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)));
    });
  }

  async deleteProduct(p: AdminProduct) {
    await this.run(p.id, async () => {
      await firstValueFrom(this.http.delete(`/api/admin/shop/products/${p.id}`));
      this.products.update((list) => list.filter((x) => x.id !== p.id));
      if (this.form().id === p.id) this.form.set(emptyProduct());
      this.confirmDelete.set(null);
    });
  }

  async cancelOrder(o: AdminShopOrder) {
    await this.run(o.order.id, async () => {
      await firstValueFrom(this.http.post(`/api/admin/shop/orders/${o.order.id}/cancel`, {}));
      this.confirmCancel.set(null);
      this.shopOrders.set(await this.get<AdminShopOrder[]>('/api/admin/shop/orders'));
    });
  }

  async deleteOrder(o: AdminShopOrder) {
    await this.run(o.order.id, async () => {
      await firstValueFrom(this.http.delete(`/api/admin/shop/orders/${o.order.id}`));
      this.shopOrders.update((list) => list.filter((x) => x.order.id !== o.order.id));
      this.confirmDelete.set(null);
      // A paid, unshipped order returns its items to stock.
      this.products.set(await this.get<AdminProduct[]>('/api/admin/shop/products'));
    });
  }

  async revokeLicense(l: ActiveLicense) {
    await this.run(l.id, async () => {
      await firstValueFrom(this.http.delete(`/api/admin/licenses/${l.id}`));
      this.licenses.update((list) => list.filter((x) => x.id !== l.id));
      this.confirmDelete.set(null);
    });
  }

  /** Switches to the inventory tab with fresh numbers, since orders and product edits change them. */
  async openInventory() {
    this.tab.set('inventory');
    await this.run('inventory', async () => this.inventory.set(await this.get<Inventory>('/api/admin/inventory')));
  }

  rowKey(r: InventoryRow) {
    return r.variantId ?? r.productId;
  }

  level(r: InventoryRow): StockLevel {
    if (r.available <= 0) return 'out';
    return r.available <= this.inventory().lowStockThreshold ? 'low' : 'ok';
  }

  editStock(r: InventoryRow, event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.stockEdits.update((e) => ({ ...e, [this.rowKey(r)]: value }));
  }

  /** The typed count when it differs from what's saved, else null. */
  pendingStock(r: InventoryRow): number | null {
    const value = this.stockEdits()[this.rowKey(r)];
    return value === undefined || value === r.onHand ? null : value;
  }

  hasStockEdits(p: InventoryProduct) {
    return p.rows.some((r) => this.pendingStock(r) !== null);
  }

  discardStock(p: InventoryProduct) {
    const keys = new Set(p.rows.map((r) => this.rowKey(r)));
    this.stockEdits.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.has(k))));
  }

  /** Saves every changed size of the product in one request. */
  async saveStock(p: InventoryProduct) {
    const items = p.rows
      .filter((r) => this.pendingStock(r) !== null)
      .map((r) => ({ variantId: r.variantId, stock: this.pendingStock(r)! }));
    if (!items.length) return;
    if (items.some((i) => !Number.isInteger(i.stock) || i.stock < 0)) {
      this.error.set(this.i18n.t('adm.err_stock'));
      return;
    }
    await this.run(p.productId, async () => {
      await firstValueFrom(this.http.put(`/api/admin/inventory/${p.productId}`, { items }));
      this.discardStock(p);
      const [inventory, products] = await Promise.all([
        this.get<Inventory>('/api/admin/inventory'),
        this.get<AdminProduct[]>('/api/admin/shop/products'),
      ]);
      this.inventory.set(inventory);
      this.products.set(products);
    });
  }

  short(id: string) {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  async load() {
    this.error.set('');
    this.loading.set(true);
    try {
      const [licenses, orders, products, inventory] = await Promise.all([
        this.get<ActiveLicense[]>('/api/admin/licenses'),
        this.get<AdminShopOrder[]>('/api/admin/shop/orders'),
        this.get<AdminProduct[]>('/api/admin/shop/products'),
        this.get<Inventory>('/api/admin/inventory'),
      ]);
      this.licenses.set(licenses);
      this.shopOrders.set(orders);
      this.products.set(products);
      this.inventory.set(inventory);
      this.loaded.set(true);
    } catch {
      this.loaded.set(false);
      this.error.set(this.i18n.t('adm.err_load'));
    } finally {
      this.loading.set(false);
    }
  }

  /** The most recent delivery step that has a date. */
  lastStep(o: ShopOrder) {
    return orderTimeline(o)
      .filter((s) => s.done && s.at)
      .pop();
  }

  async advance(o: AdminShopOrder, stage: OrderStep) {
    await this.run(o.order.id, async () => {
      await firstValueFrom(this.http.post(`/api/admin/shop/orders/${o.order.id}/advance`, { stage }));
      this.shopOrders.set(await this.get<AdminShopOrder[]>('/api/admin/shop/orders'));
    });
  }

  trackingValue(o: AdminShopOrder) {
    return this.trackingEdits()[o.order.id] ?? o.order.trackingNumber ?? '';
  }

  trackingChanged(o: AdminShopOrder) {
    return this.trackingValue(o).trim() !== (o.order.trackingNumber ?? '');
  }

  editTracking(o: AdminShopOrder, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.trackingEdits.update((e) => ({ ...e, [o.order.id]: value }));
  }

  async saveTracking(o: AdminShopOrder) {
    if (!this.trackingChanged(o)) return;
    await this.run(o.order.id, async () => {
      const trackingNumber = this.trackingValue(o).trim();
      const res = await firstValueFrom(
        this.http.put<{ data: { courierStatus: string | null } }>(`/api/admin/shop/orders/${o.order.id}/tracking`, { trackingNumber }),
      );
      const status = res.data.courierStatus;
      const note = !trackingNumber ? '' : status ? this.i18n.t('adm.sameday_status', { status }) : this.i18n.t('adm.sameday_none');
      this.trackingNotes.update((n) => ({ ...n, [o.order.id]: note }));
      this.shopOrders.set(await this.get<AdminShopOrder[]>('/api/admin/shop/orders'));
      this.trackingEdits.update(({ [o.order.id]: _saved, ...rest }) => rest);
    });
  }

  edit(p: AdminProduct) {
    const { sizes, currency, ...rest } = p;
    this.form.set({ ...rest, imageUrl: p.imageUrl ?? '', sizesText: sizes.map((s) => `${s.size}:${s.stock}`).join(', ') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setForm(field: keyof ProductForm, event: Event) {
    const input = event.target as HTMLInputElement;
    const numeric = field === 'price' || field === 'stock' || field === 'sortOrder';
    this.form.update((f) => ({ ...f, [field]: numeric ? Number(input.value) : input.value }));
  }

  setActive(event: Event) {
    this.form.update((f) => ({ ...f, isActive: (event.target as HTMLInputElement).checked }));
  }

  async saveProduct(event: Event) {
    event.preventDefault();
    const { id, sizesText, ...body } = this.form();
    await this.run('product', async () => {
      const payload = {
        ...body,
        slug: body.slug.trim().toLowerCase(),
        imageUrl: body.imageUrl.trim() || null,
        sizes: parseSizes(sizesText),
      };
      if (id) await firstValueFrom(this.http.put(`/api/admin/shop/products/${id}`, payload));
      else await firstValueFrom(this.http.post('/api/admin/shop/products', payload));
      this.products.set(await this.get<AdminProduct[]>('/api/admin/shop/products'));
      this.form.set(emptyProduct());
    });
  }

  private async run(id: string, work: () => Promise<void>) {
    this.error.set('');
    this.busy.set(id);
    try {
      await work();
    } catch (err) {
      if (!(err instanceof HttpErrorResponse)) {
        this.error.set(err instanceof SizeFormatError ? this.i18n.t('adm.err_size_format', { part: err.part }) : (err as Error).message);
        return;
      }
      const e = err;
      const fieldErrors = e.error?.errors ? Object.values(e.error.errors).flat().join(' ') : '';
      this.error.set(e.error?.error ? this.i18n.server(e.error.error) : fieldErrors || this.i18n.t('adm.err_generic'));
    } finally {
      this.busy.set(null);
    }
  }

  private async get<T>(url: string) {
    return (await firstValueFrom(this.http.get<{ data: T }>(url))).data;
  }
}
