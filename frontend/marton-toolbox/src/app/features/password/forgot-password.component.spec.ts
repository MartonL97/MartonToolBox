import { ForgotPasswordComponent } from './forgot-password.component';
import { click, renderAt, settle, text } from '../../../testing/test-helpers';

describe('ForgotPasswordComponent', () => {
  it('pre-fills the email passed from the login page', async () => {
    const { el } = await renderAt(ForgotPasswordComponent, 'forgot-password', '/forgot-password?email=maria%40example.com');
    expect((el.querySelector('input[type=email]') as HTMLInputElement).value).toBe('maria@example.com');
  });

  it('sends the reset request and shows the same answer whether or not the account exists', async () => {
    const { el, http, harness } = await renderAt(ForgotPasswordComponent, 'forgot-password', '/forgot-password?email=maria%40example.com');
    click(el.querySelector('button[type=submit]'));
    const req = http.expectOne('/api/auth/forgot-password');
    expect(req.request.body).toEqual({ email: 'maria@example.com' });
    req.flush({ data: 'ok' });
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe('Check your inbox');
    expect(el.textContent).toContain('If an account exists for maria@example.com');
  });

  it('keeps the submit button disabled until an email is entered', async () => {
    const { el } = await renderAt(ForgotPasswordComponent, 'forgot-password', '/forgot-password');
    expect((el.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBeTrue();
  });
});
