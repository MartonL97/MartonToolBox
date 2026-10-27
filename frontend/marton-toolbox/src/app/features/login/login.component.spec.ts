import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, click, renderAt, settle, text, type } from '../../../testing/test-helpers';

describe('LoginComponent', () => {
  async function setup(url = '/login') {
    const r = await renderAt(LoginComponent, 'login', url);
    const fill = (email: string, password: string) => {
      const inputs = r.el.querySelectorAll('input');
      type(inputs[0], email);
      type(inputs[1], password);
    };
    const submit = () => click(r.el.querySelector('button[type=submit]'));
    return { ...r, fill, submit };
  }

  it('links to "Forgot password?" carrying the typed email', async () => {
    const { el, harness, fill } = await setup();
    fill('maria@example.com', '');
    harness.detectChanges();
    expect(el.querySelector('a[href^="/forgot-password"]')?.getAttribute('href')).toBe('/forgot-password?email=maria@example.com');
  });

  it('logs in and goes to the return URL', async () => {
    const { http, harness, fill, submit } = await setup('/login?returnUrl=%2Fshop%2Fcart');
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    fill('maria@example.com', 'Passw0rd!');
    submit();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'maria@example.com', password: 'Passw0rd!' });
    req.flush({ data: { accessToken: 'jwt', refreshToken: 'r', expiresAt: '', user: TEST_USER } });
    await settle(harness);
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
    expect(navigate).toHaveBeenCalledWith('/shop/cart');
  });

  it('shows the error for wrong credentials', async () => {
    const { el, http, harness, fill, submit } = await setup();
    fill('maria@example.com', 'nope');
    submit();
    http.expectOne('/api/auth/login').flush({ error: 'Invalid email or password.' }, { status: 401, statusText: 'Unauthorized' });
    await settle(harness);
    expect(text(el.querySelector('.error-text'))).toBe('Invalid email or password.');
    expect(el.textContent).not.toContain('Resend confirmation email');
  });

  it('offers to resend the confirmation email for unconfirmed accounts', async () => {
    const { el, http, harness, fill, submit } = await setup();
    fill('new@example.com', 'Passw0rd!');
    submit();
    http
      .expectOne('/api/auth/login')
      .flush({ error: 'Please confirm your email first.', code: 'email_not_confirmed' }, { status: 403, statusText: 'Forbidden' });
    await settle(harness);

    const resend = Array.from(el.querySelectorAll('button')).find((b) => text(b) === 'Resend confirmation email')!;
    click(resend);
    const req = http.expectOne('/api/auth/resend-confirmation');
    expect(req.request.body).toEqual({ email: 'new@example.com' });
    req.flush({ data: 'ok' });
    await settle(harness);
    expect(el.textContent).toContain('Sent — check your inbox');
  });
});
