import { AdminComponent } from './admin.component';
import { TEST_USER, click, flushAll, render, settle, text } from '../../../testing/test-helpers';

const PRODUCT = {
  id: 'p1',
  slug: 't-shirt',
  name: 'MartonToolBox T-Shirt',
  description: 'White tee',
  price: 89,
  currency: 'RON',
  imageUrl: '/images/shop/martontoolbox-tshirt.jpg',
  stock: 0,
  isActive: true,
  sortOrder: 1,
  sizes: [
    { size: 'S', stock: 20 },
    { size: 'M', stock: 5 },
  ],
};
const ORDER = {
  order: {
    id: 'aaaabbbb-0000-0000-0000-000000000000',
    status: 'Paid',
    amount: 104,
    shippingCost: 15,
    currency: 'RON',
    createdAt: '2026-10-27T10:00:00Z',
    shippedAt: null,
    items: [{ productName: 'MartonToolBox T-Shirt', size: 'M', unitPrice: 89, quantity: 1 }],
  },
  userEmail: 'buyer@example.com',
  shippingName: 'Ion Pop',
  shippingPhone: '0722',
  shippingAddress: 'Str. 1',
  shippingCity: 'Cluj',
  shippingCounty: 'Cluj',
  shippingPostalCode: '400001',
};
const LICENSE = {
  id: 'l1',
  userEmail: 'maria@example.com',
  displayName: 'Maria',
  licenseKey: 'MTB-KEY',
  product: 'Lifetime',
  purchasedAt: '2026-10-26T00:00:00Z',
  expiresAt: null,
};

const INVENTORY = {
  lowStockThreshold: 5,
  reservationMinutes: 30,
  rows: [
    { productId: 'p1', variantId: 'v1', productName: 'MartonToolBox T-Shirt', size: 'S', isActive: true, onHand: 20, reserved: 0, awaitingShipment: 0, available: 20 },
    { productId: 'p1', variantId: 'v2', productName: 'MartonToolBox T-Shirt', size: 'M', isActive: true, onHand: 5, reserved: 2, awaitingShipment: 1, available: 3 },
    { productId: 'p2', variantId: null, productName: 'Mug', size: null, isActive: true, onHand: 1, reserved: 1, awaitingShipment: 0, available: 0 },
  ],
};

describe('AdminComponent', () => {
  async function setup() {
    const r = render(AdminComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: true } });
    r.http.expectOne('/api/admin/licenses').flush({ data: [LICENSE] });
    r.http.expectOne('/api/admin/shop/orders').flush({ data: [ORDER] });
    r.http.expectOne('/api/admin/shop/products').flush({ data: [PRODUCT] });
    r.http.expectOne('/api/admin/inventory').flush({ data: INVENTORY });
    await settle(r.fixture);
    return r;
  }
  const tab = (el: HTMLElement, label: string) => Array.from(el.querySelectorAll('.tabs button')).find((b) => text(b).startsWith(label))!;

  it('loads orders, products and licenses with counts on the tabs', async () => {
    const { el } = await setup();
    expect(Array.from(el.querySelectorAll('.tabs button')).map((b) => text(b))).toEqual([
      'Product orders (1)',
      'Products (1)',
      'Inventory (2 low)',
      'Active licenses (1)',
    ]);
  });

  it('shows the order with its size and shipping address, and marks it shipped', async () => {
    const { el, http, fixture } = await setup();
    expect(text(el)).toContain('1 × MartonToolBox T-Shirt — size M');
    expect(text(el)).toContain('400001 Cluj, Cluj');

    click(Array.from(el.querySelectorAll('button')).find((b) => text(b) === 'Mark as shipped'));
    http.expectOne(`/api/admin/shop/orders/${ORDER.order.id}/ship`).flush({ data: 'Shipped' });
    await settle(fixture);
    http.expectOne('/api/admin/shop/orders').flush({ data: [{ ...ORDER, order: { ...ORDER.order, shippedAt: '2026-10-27T12:00:00Z' } }] });
    await settle(fixture);
    expect(text(el)).toContain('Shipped 27 Oct 2026');
  });

  it('hides a product with one click', async () => {
    const { el, http, fixture, component } = await setup();
    click(tab(el, 'Products'));
    fixture.detectChanges();
    expect(el.textContent).toContain('S:20');

    click(Array.from(el.querySelectorAll('.row-buttons button')).find((b) => text(b) === 'Hide'));
    const req = http.expectOne('/api/admin/shop/products/p1/visibility');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ data: false });
    await settle(fixture);
    expect(component.products()[0].isActive).toBeFalse();
    expect(text(el.querySelector('.product-row .status-pill'))).toBe('Hidden');
  });

  it('asks for confirmation before deleting a product', async () => {
    const { el, http, fixture, component } = await setup();
    click(tab(el, 'Products'));
    fixture.detectChanges();

    click(Array.from(el.querySelectorAll('.row-buttons button')).find((b) => text(b) === 'Delete'));
    fixture.detectChanges();
    http.expectNone('/api/admin/shop/products/p1');
    expect(el.textContent).toContain('Delete “MartonToolBox T-Shirt”?');

    click(el.querySelector('.row-buttons .danger'));
    const req = http.expectOne('/api/admin/shop/products/p1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: 'p1' });
    await settle(fixture);
    expect(component.products()).toEqual([]);
  });

  it('turns "S:20, m:5" into sizes when saving a product', async () => {
    const { component, http, fixture } = await setup();
    component.edit(PRODUCT);
    component.form.update((f) => ({ ...f, sizesText: 'S:20, m:5' }));
    const saving = component.saveProduct(new Event('submit'));
    const req = http.expectOne('/api/admin/shop/products/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.sizes).toEqual([
      { size: 'S', stock: 20 },
      { size: 'M', stock: 5 },
    ]);
    req.flush({ data: 'p1' });
    await settle(fixture);
    http.expectOne('/api/admin/shop/products').flush({ data: [PRODUCT] });
    await saving;
    expect(component.form().id).toBeNull(); // form resets after saving
  });

  async function openInventory(r: Awaited<ReturnType<typeof setup>>) {
    click(tab(r.el, 'Inventory'));
    r.http.expectOne('/api/admin/inventory').flush({ data: INVENTORY });
    await settle(r.fixture);
  }

  it('flags low and out-of-stock items in the inventory', async () => {
    const r = await setup();
    await openInventory(r);
    const pills = Array.from(r.el.querySelectorAll('.inventory-row .status-pill')).map((p) => text(p));
    expect(pills).toEqual(['In stock', 'Low stock', 'Out of stock']);

    click(r.el.querySelector('.only-alerts input'));
    r.fixture.detectChanges();
    expect(r.el.querySelectorAll('.inventory-row .status-pill').length).toBe(2);
  });

  it('saves a new on-hand count for a size', async () => {
    const r = await setup();
    await openInventory(r);
    const input = r.el.querySelectorAll<HTMLInputElement>('.stock-edit input')[1];
    input.value = '12';
    input.dispatchEvent(new Event('input'));
    r.fixture.detectChanges();

    click(r.el.querySelector('.stock-edit .primary'));
    const req = r.http.expectOne('/api/admin/inventory');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ productId: 'p1', variantId: 'v2', stock: 12 });
    req.flush({ data: 12 });
    await settle(r.fixture);
    const rows = INVENTORY.rows.map((x) => (x.variantId === 'v2' ? { ...x, onHand: 12, available: 10 } : x));
    r.http.expectOne((q) => q.method === 'GET' && q.url === '/api/admin/inventory').flush({ data: { ...INVENTORY, rows } });
    r.http.expectOne('/api/admin/shop/products').flush({ data: [PRODUCT] });
    await settle(r.fixture);
    expect(r.component.inventory().rows[1].onHand).toBe(12);
    expect(r.el.querySelector('.stock-edit .primary')).toBeNull();
  });

  it('lists active licenses', async () => {
    const { el, fixture } = await setup();
    click(tab(el, 'Active licenses'));
    fixture.detectChanges();
    expect(text(el.querySelector('.license-key'))).toBe('MTB-KEY');
    expect(el.textContent).toContain('maria@example.com');
    expect(el.textContent).not.toContain('Approve');
  });

  it('cancels an order the customer asked to cancel', async () => {
    const r = render(AdminComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: true } });
    const requested = { ...ORDER, order: { ...ORDER.order, status: 'CancelRequested' } };
    r.http.expectOne('/api/admin/licenses').flush({ data: [LICENSE] });
    r.http.expectOne('/api/admin/shop/orders').flush({ data: [requested] });
    r.http.expectOne('/api/admin/shop/products').flush({ data: [PRODUCT] });
    r.http.expectOne('/api/admin/inventory').flush({ data: INVENTORY });
    await settle(r.fixture);
    expect(text(tab(r.el, 'Product orders'))).toBe('Product orders (1) · 1 to cancel');
    expect(text(r.el.querySelector('.admin-order .status-pill'))).toBe('Waiting for cancellation');

    click(Array.from(r.el.querySelectorAll('.row-buttons button')).find((b) => text(b) === 'Approve cancellation'));
    r.fixture.detectChanges();
    click(r.el.querySelector('.row-buttons .danger'));
    const req = r.http.expectOne(`/api/admin/shop/orders/${ORDER.order.id}/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: 'Cancelled' });
    await settle(r.fixture);
    r.http.expectOne('/api/admin/shop/orders').flush({ data: [{ ...ORDER, order: { ...ORDER.order, status: 'Cancelled' } }] });
    await settle(r.fixture);
    expect(text(r.el.querySelector('.admin-order .status-pill'))).toBe('Cancelled');
  });

  it('asks for confirmation before deleting an order', async () => {
    const { el, http, fixture, component } = await setup();
    click(Array.from(el.querySelectorAll('.row-buttons button')).find((b) => text(b) === 'Delete order'));
    fixture.detectChanges();
    http.expectNone(`/api/admin/shop/orders/${ORDER.order.id}`);
    expect(el.textContent).toContain('Delete order AAAABBBB?');

    click(el.querySelector('.row-buttons .danger'));
    const req = http.expectOne(`/api/admin/shop/orders/${ORDER.order.id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: ORDER.order.id });
    await settle(fixture);
    http.expectOne('/api/admin/shop/products').flush({ data: [PRODUCT] });
    await settle(fixture);
    expect(component.shopOrders()).toEqual([]);
  });

  it('asks for confirmation before removing a license', async () => {
    const { el, http, fixture, component } = await setup();
    click(tab(el, 'Active licenses'));
    fixture.detectChanges();
    click(Array.from(el.querySelectorAll('.row-buttons button')).find((b) => text(b) === 'Remove license'));
    fixture.detectChanges();
    http.expectNone('/api/admin/licenses/l1');
    expect(el.textContent).toContain('Remove license from maria@example.com?');

    click(el.querySelector('.row-buttons .danger'));
    const req = http.expectOne('/api/admin/licenses/l1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: 'l1' });
    await settle(fixture);
    expect(component.licenses()).toEqual([]);
  });
});
