import { TestBed } from '@angular/core/testing';
import { ShopOrderComponent } from './shop-order.component';
import { CartService } from '../../core/shop/cart.service';
import { MUG } from '../../../testing/shop-fixtures';
import { TEST_USER, flushAll, renderAt, settle, text } from '../../../testing/test-helpers';

const ORDER = {
  id: 'abcd1234-0000-0000-0000-000000000000',
  status: 'Paid',
  amount: 104,
  shippingCost: 15,
  currency: 'RON',
  createdAt: '2026-10-27T10:00:00Z',
  shippedAt: null,
  items: [{ productName: 'MartonToolBox T-Shirt', size: 'M', unitPrice: 89, quantity: 1 }],
};

describe('ShopOrderComponent', () => {
  async function setup(order: object) {
    const r = await renderAt(ShopOrderComponent, 'shop/orders/:id', `/shop/orders/${ORDER.id}`, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: false } });
    TestBed.inject(CartService).add(MUG, null);
    r.http.expectOne(`/api/shop/orders/${ORDER.id}/confirm`).flush({ data: order });
    await settle(r.harness);
    return r;
  }

  it('thanks the buyer once paid, shows the order and empties the cart', async () => {
    const { el } = await setup(ORDER);
    expect(text(el.querySelector('.eyebrow'))).toBe('Order ABCD1234');
    expect(text(el.querySelector('h1'))).toBe('Thank you for your order!');
    expect(text(el.querySelector('.order-panel'))).toContain('1 × MartonToolBox T-Shirt · size M');
    expect(text(el.querySelector('.summary-row.total span:last-child'))).toBe('104,00 RON');
    expect(TestBed.inject(CartService).count()).toBe(0);
  });

  it('keeps the cart when the payment failed', async () => {
    const { el } = await setup({ ...ORDER, status: 'Failed' });
    expect(text(el.querySelector('h1'))).toBe('Payment not completed');
    expect(TestBed.inject(CartService).count()).toBe(1);
    expect(el.querySelector('a[href="/shop/cart"]')).toBeTruthy();
  });

  it('mentions shipping once the order has shipped', async () => {
    const { el } = await setup({ ...ORDER, shippedAt: '2026-10-28T09:00:00Z' });
    expect(el.textContent).toContain('Your order has shipped.');
  });
});
