import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ShopOrder, money } from '../../core/shop/cart.service';

interface ActiveLicense { userEmail: string; displayName: string; licenseKey: string; product: string; purchasedAt: string; expiresAt: string | null; }
interface AdminProduct { id: string; slug: string; name: string; description: string; price: number; currency: string; imageUrl: string | null; stock: number; isActive: boolean; sortOrder: number; sizes: { size: string; stock: number }[]; }
interface AdminShopOrder {
  order: ShopOrder; userEmail: string; shippingName: string | null; shippingPhone: string | null; shippingAddress: string | null;
  shippingCity: string | null; shippingCounty: string | null; shippingPostalCode: string | null;
}
type Tab = 'orders' | 'products' | 'licenses';
/** sizesText is edited as "S:20, M:15, L:0"; empty means the product has no sizes. */
type ProductForm = Omit<AdminProduct, 'id' | 'currency' | 'imageUrl' | 'sizes'> & { id: string | null; imageUrl: string; sizesText: string };

const emptyProduct = (): ProductForm => ({ id: null, slug: '', name: '', description: '', price: 0, imageUrl: '', stock: 0, isActive: true, sortOrder: 0, sizesText: '' });

/** "S:20, M:15" -> [{size:'S',stock:20},…]. Throws a readable message on bad input. */
function parseSizes(text: string): { size: string; stock: number }[] {
  return text.split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const m = /^([^:]{1,20}):\s*(\d+)$/.exec(part);
    if (!m) throw new Error(`"${part}" should look like S:20`);
    return { size: m[1].trim().toUpperCase(), stock: Number(m[2]) };
  });
}

@Component({
  standalone: true,
  imports: [DatePipe],
  styles: [`
    .tabs{display:inline-flex;gap:4px;padding:4px;background:#eceef5;border-radius:12px;margin-bottom:18px}
    .tabs button{border:0;background:transparent;color:var(--text-2);border-radius:9px;padding:8px 16px;font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer}
    .tabs button.active{background:#fff;color:var(--brand-ink);box-shadow:var(--shadow-sm)}
    .list{display:grid;gap:12px}
    .admin-order{display:grid;grid-template-columns:1.2fr 1fr auto;gap:18px;align-items:start}
    .admin-order p{margin:2px 0;font-size:13.5px;color:var(--text-2);line-height:1.5}
    .admin-order strong{font-size:14px}
    .muted{color:var(--text-3);font-size:12.5px}
    .license-key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 8px}
    .product-row{display:grid;grid-template-columns:1fr auto auto auto auto;gap:16px;align-items:center}
    .row-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
    .row-buttons .secondary,.row-buttons .danger{padding:8px 12px}
    .danger{border:0;border-radius:10px;background:var(--danger);color:#fff;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer}
    .danger:hover:not(:disabled){filter:brightness(1.08)}
    .danger:disabled{opacity:.6;cursor:default}
    .danger-text{color:var(--danger)}
    .danger-text:hover{background:#fef2f2;border-color:#fecaca}
    .admin-form{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .admin-form .span-2{grid-column:span 2}
    .admin-form .inline{flex-direction:row;align-items:center;gap:8px}
    .form-actions{display:flex;gap:10px;grid-column:span 2}
    .form-actions .primary{margin:0}
    @media(max-width:800px){.admin-order,.product-row,.admin-form{grid-template-columns:1fr}.admin-form .span-2,.form-actions{grid-column:auto}}
  `],
  template: `<section class="page">
    <p class="eyebrow">Admin</p>
    <h1>Store admin</h1>
    <p class="lead" style="margin-bottom:22px">Manage shop products, ship orders, and see who has a license.</p>
    @if (loading() && !loaded()) { <p class="empty-preview">Loading…</p> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    @if (loaded()) {
      <div class="tabs">
        <button [class.active]="tab() === 'orders'" (click)="tab.set('orders')">Shop orders ({{ shopOrders().length }})</button>
        <button [class.active]="tab() === 'products'" (click)="tab.set('products')">Products ({{ products().length }})</button>
        <button [class.active]="tab() === 'licenses'" (click)="tab.set('licenses')">Active licenses ({{ licenses().length }})</button>
      </div>

      @if (tab() === 'orders') {
        <div class="list">
          @for (o of shopOrders(); track o.order.id) {
            <div class="panel admin-order">
              <div>
                <strong>Order {{ short(o.order.id) }}</strong> <span class="status-pill" [attr.data-status]="o.order.shippedAt ? 'shipped' : o.order.status.toLowerCase()">{{ o.order.shippedAt ? 'Shipped' : o.order.status }}</span>
                <p class="muted">{{ o.order.createdAt | date: 'd MMM y, HH:mm' }} · {{ o.userEmail }}</p>
                @for (i of o.order.items; track $index) { <p>{{ i.quantity }} × {{ i.productName }}@if (i.size) { — <strong>size {{ i.size }}</strong> }</p> }
                <p><strong>{{ money(o.order.amount, o.order.currency) }}</strong> <span class="muted" style="margin-left:6px">(shipping {{ money(o.order.shippingCost, o.order.currency) }})</span></p>
              </div>
              <div>
                <strong>Ship to</strong>
                <p>{{ o.shippingName }} · {{ o.shippingPhone }}<br>{{ o.shippingAddress }}<br>{{ o.shippingPostalCode }} {{ o.shippingCity }}, {{ o.shippingCounty }}</p>
              </div>
              <div>
                @if (o.order.status === 'Paid' && !o.order.shippedAt) {
                  <button class="primary" (click)="ship(o)" [disabled]="busy() === o.order.id">{{ busy() === o.order.id ? 'Saving…' : 'Mark as shipped' }}</button>
                } @else if (o.order.shippedAt) { <span class="muted">Shipped {{ o.order.shippedAt | date: 'd MMM y' }}</span> }
                @else { <span class="muted">Waiting for payment</span> }
              </div>
            </div>
          } @empty { <p class="empty-preview">No shop orders yet.</p> }
        </div>
      }

      @if (tab() === 'products') {
        <form class="panel admin-form" (submit)="saveProduct($event)">
          <h3 class="span-2">{{ form().id ? 'Edit product' : 'New product' }}</h3>
          <label>Name<input [value]="form().name" (input)="setForm('name', $event)" required></label>
          <label>Slug (URL id)<input [value]="form().slug" (input)="setForm('slug', $event)" placeholder="e.g. coffee-mug" required></label>
          <label class="span-2">Description<textarea rows="2" [value]="form().description" (input)="setForm('description', $event)"></textarea></label>
          <label>Price (RON)<input type="number" min="0.01" step="0.01" [value]="form().price" (input)="setForm('price', $event)" required></label>
          <label>Sizes &amp; stock<input [value]="form().sizesText" (input)="setForm('sizesText', $event)" placeholder="e.g. S:20, M:20, L:20 (empty = no sizes)"></label>
          @if (!form().sizesText.trim()) {
            <label>Stock<input type="number" min="0" step="1" [value]="form().stock" (input)="setForm('stock', $event)" required></label>
          }
          <label>Image (optional)<input [value]="form().imageUrl" (input)="setForm('imageUrl', $event)" placeholder="https://… or /images/shop/photo.jpg"></label>
          <label>Sort order<input type="number" step="1" [value]="form().sortOrder" (input)="setForm('sortOrder', $event)"></label>
          <label class="inline"><input type="checkbox" [checked]="form().isActive" (change)="setActive($event)"> Visible in shop</label>
          <div class="form-actions">
            <button class="primary" type="submit" [disabled]="busy() === 'product'">{{ busy() === 'product' ? 'Saving…' : form().id ? 'Save changes' : 'Add product' }}</button>
            @if (form().id) { <button class="secondary" type="button" (click)="form.set(emptyProduct())">Cancel</button> }
          </div>
        </form>
        <div class="list" style="margin-top:16px">
          @for (p of products(); track p.id) {
            <div class="panel product-row">
              <div><strong>{{ p.name }}</strong> <span class="muted">/{{ p.slug }}</span></div>
              <span>{{ money(p.price, p.currency) }}</span>
              <span class="muted">@if (p.sizes.length) { @for (s of p.sizes; track s.size) { {{ s.size }}:{{ s.stock }}&nbsp; } } @else { {{ p.stock }} in stock }</span>
              <span class="status-pill" [attr.data-status]="p.isActive ? 'paid' : 'failed'">{{ p.isActive ? 'Visible' : 'Hidden' }}</span>
              <div class="row-buttons">
                @if (confirmDelete() === p.id) {
                  <span class="muted">Delete “{{ p.name }}”?</span>
                  <button class="danger" (click)="deleteProduct(p)" [disabled]="busy() === p.id">{{ busy() === p.id ? 'Deleting…' : 'Yes, delete' }}</button>
                  <button class="secondary" (click)="confirmDelete.set(null)">Cancel</button>
                } @else {
                  <button class="secondary" (click)="toggleVisible(p)" [disabled]="busy() === p.id" [title]="p.isActive ? 'Hide from the shop' : 'Show in the shop'">{{ p.isActive ? 'Hide' : 'Show' }}</button>
                  <button class="secondary" (click)="edit(p)">Edit</button>
                  <button class="secondary danger-text" (click)="confirmDelete.set(p.id)">Delete</button>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (tab() === 'licenses') {
        <div class="list">
          @for (l of licenses(); track l.licenseKey) {
            <div class="panel admin-order">
              <div><strong>{{ l.displayName }}</strong><p class="muted">{{ l.userEmail }}</p></div>
              <div><span class="license-key">{{ l.licenseKey }}</span><p class="muted">{{ l.product }} · since {{ l.purchasedAt | date: 'd MMM y' }}@if (l.expiresAt) { · expires {{ l.expiresAt | date: 'd MMM y' }} }</p></div>
              <span class="status-pill" data-status="shipped">Active</span>
            </div>
          } @empty { <p class="empty-preview">No active licenses yet.</p> }
        </div>
      }
    }
  </section>`
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

  constructor() { this.load(); }

  async toggleVisible(p: AdminProduct) {
    await this.run(p.id, async () => {
      await firstValueFrom(this.http.put(`/api/admin/shop/products/${p.id}/visibility`, { isActive: !p.isActive }));
      this.products.update(list => list.map(x => x.id === p.id ? { ...x, isActive: !p.isActive } : x));
    });
  }

  async deleteProduct(p: AdminProduct) {
    await this.run(p.id, async () => {
      await firstValueFrom(this.http.delete(`/api/admin/shop/products/${p.id}`));
      this.products.update(list => list.filter(x => x.id !== p.id));
      if (this.form().id === p.id) this.form.set(emptyProduct());
      this.confirmDelete.set(null);
    });
  }

  short(id: string) { return id.replace(/-/g, '').slice(0, 8).toUpperCase(); }

  async load() {
    this.error.set('');
    this.loading.set(true);
    try {
      const [licenses, orders, products] = await Promise.all([
        this.get<ActiveLicense[]>('/api/admin/licenses'),
        this.get<AdminShopOrder[]>('/api/admin/shop/orders'),
        this.get<AdminProduct[]>('/api/admin/shop/products')
      ]);
      this.licenses.set(licenses); this.shopOrders.set(orders); this.products.set(products);
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
    this.form.set({ ...rest, imageUrl: p.imageUrl ?? '', sizesText: sizes.map(s => `${s.size}:${s.stock}`).join(', ') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setForm(field: keyof ProductForm, event: Event) {
    const input = event.target as HTMLInputElement;
    const numeric = field === 'price' || field === 'stock' || field === 'sortOrder';
    this.form.update(f => ({ ...f, [field]: numeric ? Number(input.value) : input.value }));
  }

  setActive(event: Event) { this.form.update(f => ({ ...f, isActive: (event.target as HTMLInputElement).checked })); }

  async saveProduct(event: Event) {
    event.preventDefault();
    const { id, sizesText, ...body } = this.form();
    await this.run('product', async () => {
      const payload = { ...body, slug: body.slug.trim().toLowerCase(), imageUrl: body.imageUrl.trim() || null, sizes: parseSizes(sizesText) };
      if (id) await firstValueFrom(this.http.put(`/api/admin/shop/products/${id}`, payload));
      else await firstValueFrom(this.http.post('/api/admin/shop/products', payload));
      this.products.set(await this.get<AdminProduct[]>('/api/admin/shop/products'));
      this.form.set(emptyProduct());
    });
  }

  private async run(id: string, work: () => Promise<void>) {
    this.error.set('');
    this.busy.set(id);
    try { await work(); }
    catch (err) {
      if (!(err instanceof HttpErrorResponse)) { this.error.set((err as Error).message); return; }
      const e = err;
      const fieldErrors = e.error?.errors ? Object.values(e.error.errors).flat().join(' ') : '';
      this.error.set(e.error?.error ?? (fieldErrors || 'That didn\'t work. Please try again.'));
    }
    finally { this.busy.set(null); }
  }

  private async get<T>(url: string) { return (await firstValueFrom(this.http.get<{ data: T }>(url))).data; }
}
