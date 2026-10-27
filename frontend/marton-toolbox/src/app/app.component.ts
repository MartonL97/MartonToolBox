import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { CartService } from './core/shop/cart.service';
import { IconComponent } from './core/ui/icon.component';

const NAV = [
  { path: '/tools/csv-cleaner', label: 'CSV Cleaner', icon: 'table' },
  { path: '/tools/screenshot-beautifier', label: 'Screenshot Beautifier', icon: 'sparkles' },
  { path: '/tools/image-resizer', label: 'Image Resizer', icon: 'image' },
  { path: '/tools/pdf-toolkit', label: 'PDF Toolkit', icon: 'file' },
  { path: '/tools/document-converter', label: 'Document Converter', icon: 'convert' },
];

@Component({
  selector: 'mtb-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  auth = inject(AuthService);
  cart = inject(CartService);
  nav = NAV;
  initial = computed(() => (this.auth.user()?.displayName || this.auth.user()?.email || '?').trim().charAt(0).toUpperCase());
  menuOpen = signal(false);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.menuOpen.set(false);
    });
  }

  openMenu() {
    clearTimeout(this.closeTimer);
    this.menuOpen.set(true);
  }
  /** Small delay so moving the pointer from the button down into the menu doesn't close it. */
  closeMenuSoon() {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.menuOpen.set(false), 180);
  }
  toggleMenu() {
    clearTimeout(this.closeTimer);
    this.menuOpen.update((v) => !v);
  }

  logout() {
    this.menuOpen.set(false);
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (this.menuOpen() && menu && !menu.contains(event.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuOpen.set(false);
  }
}
