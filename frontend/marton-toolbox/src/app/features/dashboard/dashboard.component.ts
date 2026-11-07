import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CartService, money } from '../../core/shop/cart.service';
import { ToolService } from '../../core/services/tool.service';
import { IconComponent } from '../../core/ui/icon.component';

/** The API stores icon names; the offline fallback list still uses the old glyphs. */
const GLYPH_TO_ICON: Record<string, string> = { '▦': 'table', '▧': 'image', '▤': 'file', '⇄': 'convert' };
/** Each tool gets its own accent color (by slug, so it stays stable when the list is filtered). */
const TONES: Record<string, string> = {
  'csv-cleaner': 'indigo',
  'image-resizer': 'violet',
  'pdf-toolkit': 'amber',
  'document-converter': 'teal',
};

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private service = inject(ToolService);
  auth = inject(AuthService);
  cart = inject(CartService);
  money = money;
  query = signal('');
  tools = signal<any[]>([]);
  filtered = computed(() => this.tools().filter((t) => (t.name + t.description).toLowerCase().includes(this.query().toLowerCase())));
  firstName = computed(() => (this.auth.user()?.displayName ?? '').trim().split(/\s+/)[0]);
  constructor() {
    this.service.list().subscribe((x) => this.tools.set(x));
    // Only needed for the free-shipping badge in the hero; the badge is simply hidden if the shop is unavailable.
    this.cart.loadCatalog().catch(() => undefined);
  }
  scrollToTools(event: Event) {
    event.preventDefault();
    document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  icon(name: string) {
    return GLYPH_TO_ICON[name] ?? name;
  }
  tone(slug: string) {
    return TONES[slug] ?? 'indigo';
  }
}
