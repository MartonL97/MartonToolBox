import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CheckoutResultComponent } from './checkout-result.component';
import { TEST_USER, flushAll, renderAt, settle, text } from '../../../testing/test-helpers';

describe('CheckoutResultComponent', () => {
  const at = (url: string) => renderAt(CheckoutResultComponent, 'checkout/result', url, { user: TEST_USER });

  it('confirms the payment with the server and celebrates', async () => {
    const { el, http, harness } = await at('/checkout/result?orderId=o-1');
    flushAll(http, '/api/account', { data: { isAdmin: false } });
    http.expectOne('/api/payments/checkout/o-1/confirm').flush({ data: { state: 'Completed', licenseGranted: true } });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Payment successful');
  });

  it('offers to try again when the payment failed', async () => {
    const { el, http, harness } = await at('/checkout/result?orderId=o-1');
    flushAll(http, '/api/account', { data: { isAdmin: false } });
    http.expectOne('/api/payments/checkout/o-1/confirm').flush({ data: { state: 'Failed', licenseGranted: false } });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Payment not successful');
    expect(el.querySelector('a[href="/billing"]')).toBeTruthy();
  });

  it('no longer shows manual-payment instructions', async () => {
    const { el, http } = await at('/checkout/result?orderId=o-1');
    flushAll(http, '/api/account', { data: { isAdmin: false } });
    expect(el.textContent).not.toContain('payment note');
    http.match('/api/payments/checkout/o-1/confirm'); // left pending: we only check the initial screen
  });

  it('sends visitors without an order back to billing', async () => {
    const { http } = await at('/checkout/result');
    flushAll(http, '/api/account', { data: { isAdmin: false } });
    http.expectNone((r) => r.url.includes('/confirm'));
    expect(TestBed.inject(Router).url).toBe('/billing');
  });
});
