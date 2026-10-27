import { BillingComponent, License } from './billing.component';
import { TEST_USER, click, render, settle, text } from '../../../testing/test-helpers';

const LICENSE: License = {
  licenseKey: 'MTB-B3E49AFDA3BF',
  product: 'Lifetime',
  status: 'Active',
  purchasedAt: '2026-10-26T10:00:00Z',
  expiresAt: null,
};

describe('BillingComponent', () => {
  /** Renders the page and answers the account check (AuthService and the page both ask). */
  async function setup(license: License | null) {
    const r = render(BillingComponent, { user: TEST_USER });
    r.http.match('/api/account').forEach((req) => req.flush({ data: { isAdmin: false, license } }));
    await settle(r.fixture);
    return r;
  }

  it('shows the active license with its key instead of "Pay now" when already paid', async () => {
    const { el } = await setup(LICENSE);
    expect(text(el.querySelector('h1'))).toBe("You're all set");
    expect(text(el.querySelector('.license-key'))).toBe('MTB-B3E49AFDA3BF');
    expect(text(el.querySelector('.license-top'))).toContain('Active since 26 October 2026');
    expect(text(el.querySelector('.license-top'))).toContain('never expires');
    expect(Array.from(el.querySelectorAll('button')).some((b) => text(b) === 'Pay now')).toBeFalse();
    expect(el.querySelector('a[href="/dashboard"]')).toBeTruthy();
  });

  it('copies the license key', async () => {
    const { el, fixture } = await setup(LICENSE);
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    click(Array.from(el.querySelectorAll('button')).find((b) => text(b) === 'Copy key'));
    await settle(fixture);
    expect(write).toHaveBeenCalledWith('MTB-B3E49AFDA3BF');
    expect(text(el.querySelector('.license-key-row button'))).toBe('Copied');
  });

  it('offers the purchase when there is no license', async () => {
    const { el } = await setup(null);
    expect(text(el.querySelector('h1'))).toBe('One-time payment, lifetime access');
    expect(text(el.querySelector('button.primary'))).toBe('Pay now');
  });

  it('starts a license checkout', async () => {
    const { el, http, fixture } = await setup(null);
    click(el.querySelector('button.primary'));
    fixture.detectChanges();
    const req = http.expectOne('/api/payments/checkout');
    expect(req.request.method).toBe('POST');
    expect(text(el.querySelector('button.primary'))).toContain('Opening payment');
    // Not flushed with success on purpose: that would redirect the test browser to the payment page.
  });

  it('shows the error and re-enables the button when checkout fails', async () => {
    const { el, http, fixture } = await setup(null);
    click(el.querySelector('button.primary'));
    http
      .expectOne('/api/payments/checkout')
      .flush({ error: 'You already have an active license.' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect(text(el.querySelector('.error-text'))).toBe('You already have an active license.');
    expect((el.querySelector('button.primary') as HTMLButtonElement).disabled).toBeFalse();
  });
});
