import { TestBed } from '@angular/core/testing';
import { AccountComponent } from './account.component';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, flushAll, render, settle, text, type } from '../../../testing/test-helpers';

const PROFILE = {
  displayName: 'Maria Ionescu',
  email: 'maria@example.com',
  phone: '0722 123 456',
  address: null,
  city: 'Cluj-Napoca',
  county: null,
  postalCode: null,
  companyName: null,
  taxId: null,
  memberSince: '2026-10-01T00:00:00Z',
};
const ACCOUNT = { user: TEST_USER, license: null, isAdmin: false, profile: PROFILE };

describe('AccountComponent', () => {
  async function setup(account: object = ACCOUNT) {
    const r = render(AccountComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: account });
    await settle(r.fixture);
    return r;
  }

  it('shows the profile header and pre-fills the form', async () => {
    const { el } = await setup();
    expect(text(el.querySelector('h1'))).toBe('Maria Ionescu');
    expect(el.textContent).toContain('Member since October 2026');
    expect((el.querySelector('input[autocomplete=tel]') as HTMLInputElement).value).toBe('0722 123 456');
  });

  it('computes profile completeness and lists what is missing', async () => {
    const { component, el } = await setup();
    expect(component.completeness()).toBe(50); // name, phone, city of 6
    expect(component.missing()).toEqual(['Street address', 'County', 'Postal code']);
    expect(text(el.querySelector('.missing'))).toContain('Postal code');
  });

  it('only enables saving once something changed', async () => {
    const { component, el, fixture } = await setup();
    const save = () => el.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(save().disabled).toBeTrue();
    type(el.querySelector('input[autocomplete=address-level1]'), 'Cluj');
    fixture.detectChanges();
    expect(component.dirty()).toBeTrue();
    expect(save().disabled).toBeFalse();
  });

  it('saves the profile and updates the name shown in the header', async () => {
    const { component, el, fixture, http } = await setup();
    type(el.querySelector('input[autocomplete=name]'), 'Maria Pop');
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const req = http.expectOne('/api/account/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.displayName).toBe('Maria Pop');
    req.flush({ data: { ...PROFILE, displayName: 'Maria Pop' } });
    await settle(fixture);

    expect(component.saved()).toBeTrue();
    expect(component.dirty()).toBeFalse();
    expect(TestBed.inject(AuthService).user()?.displayName).toBe('Maria Pop');
    expect(el.textContent).toContain('Saved');
  });

  it('shows validation errors from the server', async () => {
    const { el, fixture, http } = await setup();
    type(el.querySelector('input[autocomplete=tel]'), 'abc');
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http
      .expectOne('/api/account/profile')
      .flush({ errors: { Phone: ['Enter a valid phone number.'] } }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect(text(el.querySelector('.error-text'))).toBe('Enter a valid phone number.');
  });

  it('shows the license key when the user has one, and the Admin badge for admins', async () => {
    const { el } = await setup({
      ...ACCOUNT,
      isAdmin: true,
      license: { licenseKey: 'MTB-ABC', product: 'Lifetime', status: 'Active', expiresAt: null },
    });
    expect(text(el.querySelector('.license-key'))).toBe('MTB-ABC');
    expect(text(el.querySelector('.head-badges'))).toContain('Admin');
  });
});
