import { TestBed } from '@angular/core/testing';
import { CartComponent } from './cart.component';
import { CartService } from '../../core/shop/cart.service';
import { CATALOG, MUG, TSHIRT } from '../../../testing/shop-fixtures';
import { TEST_USER, click, render, settle, text, type } from '../../../testing/test-helpers';

const PROFILE = {
  displayName: 'Maria Ionescu',
  phone: '0722 123 456',
  address: 'Str. Memorandumului 28',
  city: 'Cluj-Napoca',
  county: 'Cluj',
  postalCode: '400114',
};

describe('CartComponent', () => {
  /** Renders the cart with the given lines already in it (as if added on the shop page). */
  async function setup({ loggedIn = false, fill = true } = {}) {
    const r = render(CartComponent, loggedIn ? { user: TEST_USER } : {});
    const cart = TestBed.inject(CartService);
    if (fill) {
      cart.add(TSHIRT, TSHIRT.sizes[1]); // M, 89
      cart.add(MUG, null, 2); // 2 × 49
    }
    r.http.expectOne('/api/shop/products').flush({ data: CATALOG });
    if (loggedIn) r.http.match('/api/account').forEach((req) => req.flush({ data: { isAdmin: false, profile: PROFILE } }));
    await settle(r.fixture);
    return { ...r, cart };
  }

  it('shows an empty state with a link to the shop', async () => {
    const { el } = await setup({ fill: false });
    expect(text(el.querySelector('.empty-state h3'))).toBe('Your cart is empty');
    expect(el.querySelector('.empty-state a[href="/shop"]')).toBeTruthy();
  });

  it('lists lines with their size and computes totals with shipping', async () => {
    const { el } = await setup();
    const lines = Array.from(el.querySelectorAll('.cart-line'));
    expect(lines.length).toBe(2);
    expect(text(lines[0].querySelector('.cart-info span'))).toBe('Size M · 89,00 RON each');
    expect(text(el.querySelector('.summary-row.total span:last-child'))).toBe('202,00 RON'); // 187 + 15 shipping
    expect(text(el.querySelector('.hint-box'))).toBe('Add 13,00 RON more for free shipping.');
  });

  it('respects the stock of the chosen size', async () => {
    const { el, cart, fixture } = await setup();
    const plus = () => el.querySelectorAll<HTMLButtonElement>('.cart-line')[0].querySelectorAll<HTMLButtonElement>('.stepper button')[1];
    click(plus());
    fixture.detectChanges();
    click(plus());
    fixture.detectChanges();
    expect(cart.quantityInCart('tee', 'm')).toBe(3);
    expect(plus().disabled).toBeTrue(); // size M has 3 in stock
  });

  it('asks visitors to log in before checking out', async () => {
    const { el } = await setup();
    const login = el.querySelector('.summary a.primary') as HTMLAnchorElement;
    expect(text(login)).toBe('Log in to check out');
    expect(login.getAttribute('href')).toBe('/login?returnUrl=%2Fshop%2Fcart');
  });

  it('pre-fills the shipping form from the account profile', async () => {
    const { component } = await setup({ loggedIn: true });
    expect(component.shipping()).toEqual({
      name: 'Maria Ionescu',
      phone: '0722 123 456',
      address: 'Str. Memorandumului 28',
      city: 'Cluj-Napoca',
      county: 'Cluj',
      postalCode: '400114',
    });
    expect(component.formValid()).toBeTrue();
  });

  it('sends product, size and shipping (never prices) when paying', async () => {
    const { el, http, fixture } = await setup({ loggedIn: true });
    type(el.querySelector('input[autocomplete=name]'), 'Ion Pop');
    fixture.detectChanges();
    click(el.querySelector('.summary button.primary'));

    const req = http.expectOne('/api/shop/orders');
    expect(req.request.body.items).toEqual([
      { productId: 'tee', variantId: 'm', quantity: 1 },
      { productId: 'mug', variantId: null, quantity: 2 },
    ]);
    expect(req.request.body.shipping.name).toBe('Ion Pop');
    expect(JSON.stringify(req.request.body)).not.toContain('price');
    // Answer with an error so the test page isn't redirected to the payment provider.
    req.flush({ error: 'Only 2 × MartonToolBox T-Shirt (size M) left in stock.' }, { status: 400, statusText: 'Bad Request' });
    http.match('/api/shop/products').forEach((r) => r.flush({ data: CATALOG }));
    await settle(fixture);
    expect(text(el.querySelector('.summary .error-text'))).toBe('Only 2 × MartonToolBox T-Shirt (size M) left in stock.');
  });
});
