import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CartService, lineKey, money } from './cart.service';
import { CATALOG, MUG, TSHIRT } from '../../../testing/shop-fixtures';

describe('CartService', () => {
  let cart: CartService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    cart = TestBed.inject(CartService);
    http = TestBed.inject(HttpTestingController);
  });

  const M = TSHIRT.sizes[1];
  const S = TSHIRT.sizes[0];

  it('keeps one line per product and size, merging repeat adds', () => {
    cart.add(TSHIRT, S);
    cart.add(TSHIRT, S);
    cart.add(TSHIRT, M);
    expect(cart.lines().length).toBe(2);
    expect(cart.quantityInCart('tee', 's')).toBe(2);
    expect(cart.count()).toBe(3);
    expect(cart.subtotal()).toBe(3 * 89);
  });

  it("never exceeds the size's stock", () => {
    cart.add(TSHIRT, M, 10);
    expect(cart.quantityInCart('tee', 'm')).toBe(3);
  });

  it('removes a line when its quantity drops to zero', () => {
    cart.add(MUG, null, 2);
    const key = lineKey({ productId: 'mug', variantId: null });
    cart.setQuantity(key, 0);
    expect(cart.lines()).toEqual([]);
  });

  it('persists to localStorage', () => {
    cart.add(MUG, null);
    expect(JSON.parse(localStorage.getItem('mtb_cart')!)[0].productId).toBe('mug');
  });

  it('charges shipping until the free-shipping threshold', async () => {
    const loading = cart.loadCatalog();
    http.expectOne('/api/shop/products').flush({ data: CATALOG });
    await loading;
    expect(cart.shippingFor(0)).toBe(0);
    expect(cart.shippingFor(89)).toBe(15);
    expect(cart.shippingFor(200)).toBe(0);
  });

  it('refreshing the catalog drops sizes and products that no longer exist', async () => {
    cart.add(TSHIRT, S);
    cart.add(MUG, null);
    const loading = cart.loadCatalog();
    http.expectOne('/api/shop/products').flush({ data: { ...CATALOG, products: [{ ...TSHIRT, sizes: [M] }] } });
    await loading;
    expect(cart.lines()).toEqual([]);
  });

  it('formats money the Romanian way', () => {
    expect(money(1234.5)).toBe('1.234,50 RON');
    expect(money(89, 'PLN')).toBe('89,00 PLN');
  });
});
