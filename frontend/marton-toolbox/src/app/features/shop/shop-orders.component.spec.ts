import { ShopOrdersComponent } from './shop-orders.component';
import { TEST_USER, flushAll, render, settle, text } from '../../../testing/test-helpers';

const base = { amount: 104, shippingCost: 15, currency: 'RON', createdAt: '2026-10-27T10:00:00Z', shippedAt: null };
const ORDERS = [
  {
    ...base,
    id: 'aaaa1111-0000-0000-0000-000000000000',
    status: 'Paid',
    shippedAt: '2026-10-28T09:00:00Z',
    items: [{ productName: 'Tee', size: 'M', unitPrice: 89, quantity: 1 }],
  },
  {
    ...base,
    id: 'bbbb2222-0000-0000-0000-000000000000',
    status: 'Pending',
    items: [{ productName: 'Mug', size: null, unitPrice: 49, quantity: 2 }],
  },
];

describe('ShopOrdersComponent', () => {
  async function setup(orders: object[]) {
    const r = render(ShopOrdersComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: false } });
    r.http.expectOne('/api/shop/orders').flush({ data: orders });
    await settle(r.fixture);
    return r;
  }

  it('lists orders with item counts, status and links to each order', async () => {
    const { el } = await setup(ORDERS);
    const rows = Array.from(el.querySelectorAll<HTMLAnchorElement>('a.order-row'));
    expect(rows.length).toBe(2);
    expect(rows.map((r) => text(r.querySelector('.status-pill')))).toEqual(['Shipped', 'Awaiting payment']);
    expect(text(rows[1])).toContain('2 items');
    expect(rows[0].getAttribute('href')).toBe('/shop/orders/aaaa1111-0000-0000-0000-000000000000');
  });

  it('shows an empty state when there are no orders yet', async () => {
    const { el } = await setup([]);
    expect(text(el.querySelector('.empty-state h3'))).toBe('No orders yet');
  });
});
