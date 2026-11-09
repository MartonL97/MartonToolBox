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

  it('lets the buyer ask to cancel an unpaid order', async () => {
    const { el, http, harness } = await setup({ ...ORDER, status: 'Pending' });
    const cancel = Array.from(el.querySelectorAll('.actions button')).find((b) => text(b) === 'Cancel order')!;
    (cancel as HTMLElement).click();
    harness.detectChanges();
    http.expectNone(`/api/shop/orders/${ORDER.id}/cancel`);

    (el.querySelector('.actions .danger') as HTMLElement).click();
    http.expectOne(`/api/shop/orders/${ORDER.id}/cancel`).flush({ data: { ...ORDER, status: 'CancelRequested' } });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Waiting for cancellation');
    expect(Array.from(el.querySelectorAll('.actions button')).some((b) => text(b) === 'Cancel order')).toBeFalse();
  });

  it('offers no cancel button once paid', async () => {
    const { el } = await setup(ORDER);
    expect(Array.from(el.querySelectorAll('.actions button')).some((b) => text(b) === 'Cancel order')).toBeFalse();
  });

  it('mentions shipping once the order has shipped', async () => {
    const { el } = await setup({ ...ORDER, shippedAt: '2026-10-28T09:00:00Z' });
    expect(el.textContent).toContain('Your order has shipped.');
  });

  it('shows the delivery steps reached so far with their dates', async () => {
    const { el } = await setup({ ...ORDER, paidAt: '2026-10-27T10:02:00Z', preparedAt: '2026-10-27T15:00:00Z' });
    const steps = Array.from(el.querySelectorAll('.timeline li'));
    expect(steps.map((s) => s.classList.contains('done'))).toEqual([true, true, true, false, false, false, false, false]);
    expect(text(steps[2])).toContain('Products ready for delivery');
    expect(steps[2].querySelector('time')).toBeTruthy();
    expect(steps[3].querySelector('time')).toBeNull();
  });

  it('shows a finished order and its AWB without letting the buyer change anything', async () => {
    const { el } = await setup({ ...ORDER, shippedAt: '2026-10-28T09:00:00Z', deliveredAt: '2026-10-30T09:00:00Z', trackingNumber: 'AWB123456' });
    expect(el.textContent).toContain('Your order has been delivered.');
    expect(text(el.querySelector('.tracking'))).toContain('AWB123456');
    expect(el.querySelector('.actions button')).toBeNull();
  });
});
