import { TestBed } from '@angular/core/testing';
import { ShopComponent } from './shop.component';
import { CartService } from '../../core/shop/cart.service';
import { CATALOG } from '../../../testing/shop-fixtures';
import { click, render, settle, text } from '../../../testing/test-helpers';

describe('ShopComponent', () => {
  async function setup() {
    const r = render(ShopComponent);
    r.http.expectOne('/api/shop/products').flush({ data: CATALOG });
    await settle(r.fixture);
    const card = (name: string) => Array.from(r.el.querySelectorAll('.product-card')).find((c) => text(c.querySelector('h3')) === name)!;
    return { ...r, card, cart: TestBed.inject(CartService) };
  }

  it('shows each product with photo, price and free-shipping note', async () => {
    const { el, card } = await setup();
    expect(el.querySelectorAll('.product-card').length).toBe(2);
    expect(card('MartonToolBox T-Shirt').querySelector('img')?.getAttribute('src')).toBe('/images/shop/martontoolbox-tshirt.jpg');
    expect(text(card('MartonToolBox T-Shirt').querySelector('.price'))).toBe('89,00 RON');
    expect(text(el.querySelector('.lead'))).toContain('Free shipping on orders over 200,00 RON');
  });

  it('requires a size before adding a sized product', async () => {
    const { card, fixture, cart } = await setup();
    const tee = card('MartonToolBox T-Shirt');
    const addButton = tee.querySelector('.product-foot button') as HTMLButtonElement;
    expect(addButton.disabled).toBeTrue();
    expect(text(addButton)).toBe('Select a size');

    click(Array.from(tee.querySelectorAll('.size')).find((b) => text(b) === 'M'));
    fixture.detectChanges();
    expect(addButton.disabled).toBeFalse();
    click(addButton);
    fixture.detectChanges();

    expect(cart.lines()).toEqual([jasmine.objectContaining({ productId: 'tee', variantId: 'm', size: 'M', quantity: 1 })]);
    expect(text(addButton)).toContain('Added to cart');
  });

  it('disables sold-out sizes and flags low stock', async () => {
    const { card, fixture } = await setup();
    const tee = card('MartonToolBox T-Shirt');
    const sizeL = Array.from(tee.querySelectorAll<HTMLButtonElement>('.size')).find((b) => text(b) === 'L')!;
    expect(sizeL.disabled).toBeTrue();
    click(Array.from(tee.querySelectorAll('.size')).find((b) => text(b) === 'M'));
    fixture.detectChanges();
    expect(text(tee.querySelector('.size-label'))).toContain('Only 3 left');
  });

  it('adds products without sizes directly and shows the cart bar', async () => {
    const { el, card, fixture } = await setup();
    click(card('Mug').querySelector('.product-foot button'));
    fixture.detectChanges();
    expect(text(el.querySelector('.cart-bar'))).toContain('1 item · 49,00 RON');
  });
});
