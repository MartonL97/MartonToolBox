import { ShopCatalog, ShopProduct } from '../app/core/shop/cart.service';

/** Shop test data shared by the specs. */
export const TSHIRT: ShopProduct = {
  id: 'tee',
  slug: 't-shirt',
  name: 'MartonToolBox T-Shirt',
  description: 'White tee',
  price: 89,
  currency: 'RON',
  imageUrl: '/images/shop/martontoolbox-tshirt.jpg',
  stock: 25,
  sizes: [
    { id: 's', size: 'S', stock: 20 },
    { id: 'm', size: 'M', stock: 3 },
    { id: 'l', size: 'L', stock: 0 },
  ],
};
export const MUG: ShopProduct = {
  id: 'mug',
  slug: 'mug',
  name: 'Mug',
  description: '',
  price: 49,
  currency: 'RON',
  imageUrl: null,
  stock: 10,
  sizes: [],
};
export const CATALOG: ShopCatalog = { products: [TSHIRT, MUG], shippingCost: 15, freeShippingOver: 200, currency: 'RON' };
