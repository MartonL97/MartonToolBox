import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { CartService } from './core/shop/cart.service';
import { IconComponent } from './core/ui/icon.component';

const NAV = [
  { path: '/tools/csv-cleaner', label: 'CSV Cleaner', icon: 'table' },
  { path: '/tools/screenshot-beautifier', label: 'Screenshot Beautifier', icon: 'sparkles' },
  { path: '/tools/image-resizer', label: 'Image Resizer', icon: 'image' },
  { path: '/tools/pdf-toolkit', label: 'PDF Toolkit', icon: 'file' },
  { path: '/tools/document-converter', label: 'Document Converter', icon: 'convert' }
];

@Component({
  selector: 'mtb-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `<div class="shell">
    <aside>
      <a class="brand" routerLink="/dashboard"><span class="brand-mark"><mtb-icon name="bolt" /></span>MartonToolBox</a>
      <nav>
        <a routerLink="/dashboard" routerLinkActive="active"><mtb-icon name="dashboard" />Dashboard</a>
        <p>Tools</p>
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active"><mtb-icon [name]="item.icon" />{{ item.label }}</a>
        }
        <p>Shop</p>
        <a routerLink="/shop" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><mtb-icon name="bag" />Merch shop</a>
        <a routerLink="/shop/cart" routerLinkActive="active"><mtb-icon name="cart" />Cart @if (cart.count()) { <span class="nav-badge">{{ cart.count() }}</span> }</a>
        @if (auth.isAuthenticated()) { <a routerLink="/shop/orders" routerLinkActive="active"><mtb-icon name="package" />My orders</a> }
        <p>Account</p>
        <a routerLink="/billing" routerLinkActive="active"><mtb-icon name="card" />Billing</a>
        @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="active"><mtb-icon name="shield" />Admin</a> }
      </nav>
      <div class="privacy"><mtb-icon name="shield" /><div><strong>Private by design</strong><span>Most tools run entirely in your browser.</span></div></div>
    </aside>
    <main>
      <header>
        <a class="mobile-brand" routerLink="/dashboard"><span class="brand-mark"><mtb-icon name="bolt" /></span>MartonToolBox</a>
        <a class="header-cart" routerLink="/shop/cart" title="Cart"><mtb-icon name="cart" />@if (cart.count()) { <span class="nav-badge">{{ cart.count() }}</span> }</a>
        @if (auth.isAuthenticated()) {
          <a class="account" routerLink="/account"><span class="avatar">{{ initial() }}</span><span class="account-name">{{ auth.user()?.displayName || 'Account' }}</span></a>
        } @else {
          <a class="account" routerLink="/login"><mtb-icon name="login" />Log in</a>
        }
      </header>
      <router-outlet />
    </main>
  </div>`
})
export class AppComponent {
  auth = inject(AuthService);
  cart = inject(CartService);
  nav = NAV;
  initial = computed(() => (this.auth.user()?.displayName || this.auth.user()?.email || '?').trim().charAt(0).toUpperCase());
}
