import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';
import { CartService } from './core/shop/cart.service';
import { TEST_USER, click, flushAll, render, text } from '../testing/test-helpers';

describe('AppComponent', () => {
  it('shows every tool in the sidebar', () => {
    const { el } = render(AppComponent);
    const labels = Array.from(el.querySelectorAll('aside nav a')).map((a) => text(a));
    expect(labels).toEqual(
      jasmine.arrayContaining(['Dashboard', 'CSV Cleaner', 'Image Resizer', 'PDF Toolkit', 'Document Converter']),
    );
  });

  it('offers "Log in" and hides account-only links when logged out', () => {
    const { el } = render(AppComponent);
    expect(text(el.querySelector('header a.account'))).toBe('Log in');
    expect(el.querySelector('.user-menu')).toBeNull();
    expect(text(el.querySelector('aside nav'))).not.toContain('My orders');
  });

  it('shows the cart count badge in the header', () => {
    const { el, fixture } = render(AppComponent);
    TestBed.inject(CartService).add(
      { id: 'p1', slug: 'tee', name: 'Tee', description: '', price: 89, currency: 'RON', imageUrl: null, stock: 5, sizes: [] },
      null,
      2,
    );
    fixture.detectChanges();
    expect(text(el.querySelector('.header-cart .nav-badge'))).toBe('2');
  });

  describe('when logged in', () => {
    it('shows the avatar and name, and an Admin link only for admins', () => {
      const { el, fixture, http } = render(AppComponent, { user: TEST_USER });
      flushAll(http, '/api/account', { data: { isAdmin: false } });
      fixture.detectChanges();
      expect(text(el.querySelector('.avatar'))).toBe('M');
      expect(text(el.querySelector('.account-name'))).toBe('Maria Ionescu');
      expect(text(el.querySelector('aside nav'))).not.toContain('Admin');

      TestBed.inject(AuthService).isAdmin.set(true);
      fixture.detectChanges();
      expect(text(el.querySelector('aside nav'))).toContain('Admin');
    });

    it('opens the user menu and logs out from it', async () => {
      const { el, fixture, component, http } = render(AppComponent, { user: TEST_USER });
      flushAll(http, '/api/account', { data: { isAdmin: false } });
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

      click(el.querySelector('.user-menu .account'));
      fixture.detectChanges();
      expect(component.menuOpen()).toBeTrue();
      expect(text(el.querySelector('.menu'))).toContain('Log out');

      click(el.querySelector('.menu-logout'));
      fixture.detectChanges();
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
      expect(navigate).toHaveBeenCalledWith('/login');
      expect(el.querySelector('.menu')).toBeNull();
    });

    it('closes the user menu on Escape', () => {
      const { fixture, component, http } = render(AppComponent, { user: TEST_USER });
      flushAll(http, '/api/account', { data: { isAdmin: false } });
      component.menuOpen.set(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(component.menuOpen()).toBeFalse();
    });
  });
});
