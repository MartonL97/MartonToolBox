import { TestBed } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../core/auth/auth.service';
import { click, render, settle, text, type } from '../../../testing/test-helpers';

describe('RegisterComponent', () => {
  function setup() {
    const r = render(RegisterComponent);
    const inputs = () => r.el.querySelectorAll('input');
    const fill = (name: string, email: string, password: string, confirm: string) => {
      const [n, e, p, c] = Array.from(inputs());
      type(n, name);
      type(e, email);
      type(p, password);
      type(c, confirm);
      r.fixture.detectChanges();
    };
    const submitButton = () => r.el.querySelector('button[type=submit]') as HTMLButtonElement;
    return { ...r, fill, submitButton };
  }

  it('warns and blocks submit when the passwords differ', () => {
    const { el, fill, submitButton } = setup();
    fill('Maria', 'maria@example.com', 'Passw0rd!', 'Passw0rd?');
    expect(text(el.querySelector('.field-error'))).toBe("The passwords don't match.");
    expect(submitButton().disabled).toBeTrue();
  });

  it('creates the account and asks the user to check their inbox (no auto-login)', async () => {
    const { el, http, fixture, fill, submitButton } = setup();
    fill('Maria', 'maria@example.com', 'Passw0rd!', 'Passw0rd!');
    click(submitButton());

    const req = http.expectOne('/api/auth/register');
    expect(req.request.body.confirmPassword).toBe('Passw0rd!');
    req.flush({ data: { email: 'maria@example.com', emailSent: true } });
    await settle(fixture);

    expect(text(el.querySelector('h1'))).toBe('Check your inbox');
    expect(el.textContent).toContain('maria@example.com');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('tells the user when the email could not be sent', async () => {
    const { el, http, fixture, fill, submitButton } = setup();
    fill('Maria', 'maria@example.com', 'Passw0rd!', 'Passw0rd!');
    click(submitButton());
    http.expectOne('/api/auth/register').flush({ data: { email: 'maria@example.com', emailSent: false } });
    await settle(fixture);
    expect(text(el.querySelector('.error-text'))).toContain("couldn't send the email");
  });

  it('shows server-side password rule errors', async () => {
    const { el, http, fixture, fill, submitButton } = setup();
    fill('Maria', 'maria@example.com', 'password1', 'password1');
    click(submitButton());
    http
      .expectOne('/api/auth/register')
      .flush(
        { errors: [{ code: 'PasswordRequiresUpper', description: 'Passwords must have at least one uppercase.' }] },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle(fixture);
    expect(text(el.querySelector('.error-text'))).toBe('Passwords must have at least one uppercase.');
  });
});
