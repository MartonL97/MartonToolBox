import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, extractAuthError, safeReturnUrl } from './auth.service';
import { TEST_USER, logIn } from '../../../testing/test-helpers';

describe('AuthService', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  const session = { accessToken: 'jwt', refreshToken: 'r', expiresAt: '2030-01-01', user: TEST_USER };

  it('logs in, stores the session and loads the admin flag', async () => {
    const auth = create();
    const done = auth.login('maria@example.com', 'Passw0rd!');
    http.expectOne('/api/auth/login').flush({ data: session });
    await done;
    http.expectOne('/api/account').flush({ data: { isAdmin: true } });
    await Promise.resolve();

    expect(auth.isAuthenticated()).toBeTrue();
    expect(auth.user()?.displayName).toBe('Maria Ionescu');
    expect(localStorage.getItem('mtb_token')).toBe('jwt');
    expect(auth.isAdmin()).toBeTrue();
  });

  it('restores a saved session on startup', () => {
    logIn();
    const auth = create();
    http.expectOne('/api/account').flush({ data: { isAdmin: false } });
    expect(auth.isAuthenticated()).toBeTrue();
    expect(auth.user()?.email).toBe('maria@example.com');
  });

  it('logout clears everything', () => {
    logIn();
    const auth = create();
    http.expectOne('/api/account').flush({ data: { isAdmin: true } });
    auth.logout();
    expect(auth.isAuthenticated()).toBeFalse();
    expect(auth.user()).toBeNull();
    expect(auth.isAdmin()).toBeFalse();
    expect(localStorage.getItem('mtb_token')).toBeNull();
  });

  it('register sends the password confirmation and does not sign in', async () => {
    const auth = create();
    const result = auth.register('Maria', 'maria@example.com', 'Passw0rd!', 'Passw0rd!');
    const req = http.expectOne('/api/auth/register');
    expect(req.request.body).toEqual({
      displayName: 'Maria',
      email: 'maria@example.com',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
    });
    req.flush({ data: { email: 'maria@example.com', emailSent: true } });
    expect(await result).toEqual({ email: 'maria@example.com', emailSent: true });
    expect(auth.isAuthenticated()).toBeFalse();
  });

  it('updateDisplayName keeps the stored user in sync', () => {
    logIn();
    const auth = create();
    http.expectOne('/api/account').flush({ data: { isAdmin: false } });
    auth.updateDisplayName('Maria P.');
    expect(auth.user()?.displayName).toBe('Maria P.');
    expect(JSON.parse(localStorage.getItem('mtb_user')!).displayName).toBe('Maria P.');
  });
});

describe('safeReturnUrl', () => {
  it('allows local paths', () => expect(safeReturnUrl('/shop/cart')).toBe('/shop/cart'));
  it('rejects external and protocol-relative URLs', () => {
    expect(safeReturnUrl('https://evil.example')).toBe('/account');
    expect(safeReturnUrl('//evil.example')).toBe('/account');
  });
  it('defaults to /account', () => expect(safeReturnUrl(null)).toBe('/account'));
});

describe('extractAuthError', () => {
  it('reads a plain error message', () =>
    expect(extractAuthError({ error: { error: 'Invalid email or password.' } })).toBe('Invalid email or password.'));
  it('joins Identity error descriptions', () => {
    const err = { error: { errors: [{ description: 'Too short.' }, { description: 'Needs a digit.' }] } };
    expect(extractAuthError(err)).toBe('Too short. Needs a digit.');
  });
  it('flattens validation errors', () => expect(extractAuthError({ error: { errors: { Email: ['Bad email.'] } } })).toBe('Bad email.'));
  it('has a generic fallback', () => expect(extractAuthError(undefined)).toContain('Something went wrong'));
});
