import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ConfirmEmailComponent } from './confirm-email.component';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, renderAt, settle, text } from '../../../testing/test-helpers';

describe('ConfirmEmailComponent', () => {
  const session = { accessToken: 'jwt', refreshToken: 'r', expiresAt: '', user: TEST_USER };

  it('activates the account, signs in and continues to the dashboard', async () => {
    jasmine.clock().install();
    try {
      const { el, http, harness } = await renderAt(ConfirmEmailComponent, 'confirm-email', '/confirm-email?userId=u-1&token=abc');
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      const req = http.expectOne('/api/auth/confirm-email');
      expect(req.request.body).toEqual({ userId: 'u-1', token: 'abc' });
      req.flush({ data: session });
      for (let i = 0; i < 3; i++) await Promise.resolve();
      harness.detectChanges();

      expect(text(el.querySelector('h1'))).toBe('Your account is active');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
      jasmine.clock().tick(2500);
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('says "already confirmed" for a reused link (409)', async () => {
    const { el, http, harness } = await renderAt(ConfirmEmailComponent, 'confirm-email', '/confirm-email?userId=u-1&token=abc');
    http.expectOne('/api/auth/confirm-email').flush({ code: 'already_confirmed' }, { status: 409, statusText: 'Conflict' });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Already confirmed');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('offers a new link when the token is invalid', async () => {
    const { el, http, harness } = await renderAt(ConfirmEmailComponent, 'confirm-email', '/confirm-email?userId=u-1&token=bad');
    http
      .expectOne('/api/auth/confirm-email')
      .flush({ error: 'This confirmation link is invalid or has expired.' }, { status: 400, statusText: 'Bad Request' });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Link not valid');
    expect(text(el.querySelector('button[type=submit]'))).toBe('Send a new link');
  });

  it('rejects an incomplete link without calling the API', async () => {
    const { el, http } = await renderAt(ConfirmEmailComponent, 'confirm-email', '/confirm-email?userId=u-1');
    http.expectNone('/api/auth/confirm-email');
    expect(el.textContent).toContain('incomplete');
  });
});
