import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ShopOrder, money } from '../../core/shop/cart.service';

interface ActiveLicense {
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
type Tab = 'orders' | 'products' | 'licenses';
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
function parseSizes(text: string): { size: string; stock: number }[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^([^:]{1,20}):\s*(\d+)$/.exec(part);
      if (!m) throw new Error(`"${part}" should look like S:20`);
      return { size: m[1].trim().toUpperCase(), stock: Number(m[2]) };
    });
}

@Component({
  standalone: true,
  imports: [DatePipe],
  styleUrl: './admin.component.scss',
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private http = inject(HttpClient);
  tab = signal<Tab>('orders');
  loading = signal(false);
  loaded = signal(false);
  error = signal('');
  busy = signal<string | null>(null);
  licenses = signal<ActiveLicense[]>([]);
  shopOrders = signal<AdminShopOrder[]>([]);
  products = signal<AdminProduct[]>([]);
  form = signal<ProductForm>(emptyProduct());
  /** Product id awaiting a second click to confirm deletion. */
  confirmDelete = signal<string | null>(null);
  emptyProduct = emptyProduct;
  money = money;

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

  short(id: string) {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  async load() {
    this.error.set('');
    this.loading.set(true);
    try {
      const [licenses, orders, products] = await Promise.all([
        this.get<ActiveLicense[]>('/api/admin/licenses'),
        this.get<AdminShopOrder[]>('/api/admin/shop/orders'),
        this.get<AdminProduct[]>('/api/admin/shop/products'),
      ]);
      this.licenses.set(licenses);
      this.shopOrders.set(orders);
      this.products.set(products);
      this.loaded.set(true);
    } catch {
      this.loaded.set(false);
      this.error.set('Could not load admin data. Please reload the page.');
    } finally {
      this.loading.set(false);
    }
  }

  async ship(o: AdminShopOrder) {
    await this.run(o.order.id, async () => {
      await firstValueFrom(this.http.post(`/api/admin/shop/orders/${o.order.id}/ship`, {}));
      this.shopOrders.set(await this.get<AdminShopOrder[]>('/api/admin/shop/orders'));
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
        this.error.set((err as Error).message);
        return;
      }
      const e = err;
      const fieldErrors = e.error?.errors ? Object.values(e.error.errors).flat().join(' ') : '';
      this.error.set(e.error?.error ?? (fieldErrors || "That didn't work. Please try again."));
    } finally {
      this.busy.set(null);
    }
  }

  private async get<T>(url: string) {
    return (await firstValueFrom(this.http.get<{ data: T }>(url))).data;
  }
}
