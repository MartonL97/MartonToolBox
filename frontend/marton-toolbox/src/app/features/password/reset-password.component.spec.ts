import { TestBed } from '@angular/core/testing';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, click, renderAt, settle, text, type } from '../../../testing/test-helpers';

describe('ResetPasswordComponent', () => {
  const url = '/reset-password?userId=u-1&token=tok';

  async function setup(link = url) {
    const r = await renderAt(ResetPasswordComponent, 'reset-password', link);
    const fill = (password: string, confirm: string) => {
      const [p, c] = Array.from(r.el.querySelectorAll('input'));
      type(p, password);
      type(c, confirm);
      r.harness.detectChanges();
    };
    return { ...r, fill, submit: () => click(r.el.querySelector('button[type=submit]')) };
  }

  it('sets the new password and signs in', async () => {
    jasmine.clock().install();
    try {
      const { el, http, harness, fill, submit } = await setup();
      fill('NewPassw0rd!', 'NewPassw0rd!');
      submit();
      const req = http.expectOne('/api/auth/reset-password');
      expect(req.request.body).toEqual({ userId: 'u-1', token: 'tok', password: 'NewPassw0rd!', confirmPassword: 'NewPassw0rd!' });
      req.flush({ data: { accessToken: 'jwt', refreshToken: 'r', expiresAt: '', user: TEST_USER } });
      for (let i = 0; i < 3; i++) await Promise.resolve();
      harness.detectChanges();
      expect(text(el.querySelector('h1'))).toBe('Password changed');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
      jasmine.clock().tick(2500);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('blocks mismatched passwords', async () => {
    const { el, fill } = await setup();
    fill('NewPassw0rd!', 'Other1!xyz');
    expect(text(el.querySelector('.field-error'))).toBe("The passwords don't match.");
    expect((el.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('switches to "Link not valid" for an expired or used link', async () => {
    const { el, http, harness, fill, submit } = await setup();
    fill('NewPassw0rd!', 'NewPassw0rd!');
    submit();
    http
      .expectOne('/api/auth/reset-password')
      .flush({ error: 'This reset link is invalid or has expired.', code: 'invalid_token' }, { status: 400, statusText: 'Bad Request' });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Link not valid');
    expect(el.querySelector('a[href="/forgot-password"]')).toBeTruthy();
  });

  it('keeps the form open for password rule errors', async () => {
    const { el, http, harness, fill, submit } = await setup();
    fill('newpassw0rd', 'newpassw0rd');
    submit();
    http
      .expectOne('/api/auth/reset-password')
      .flush(
        { errors: [{ code: 'PasswordRequiresUpper', description: 'Passwords must have at least one uppercase.' }] },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Choose a new password');
    expect(text(el.querySelector('.error-text'))).toBe('Passwords must have at least one uppercase.');
  });

  it('treats a link without a token as invalid', async () => {
    const { el } = await setup('/reset-password?userId=u-1');
    expect(text(el.querySelector('h1'))).toBe('Link not valid');
  });
});
