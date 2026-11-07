import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CartService, money } from '../../core/shop/cart.service';
import { ToolService } from '../../core/services/tool.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

/** The API stores icon names; the offline fallback list still uses the old glyphs. */
const GLYPH_TO_ICON: Record<string, string> = { '▦': 'table', '▧': 'image', '▤': 'file', '⇄': 'convert' };
/** Each tool gets its own accent color (by slug, so it stays stable when the list is filtered). */
const TONES: Record<string, string> = {
  'csv-cleaner': 'indigo',
  'image-resizer': 'violet',
  'pdf-toolkit': 'amber',
  'document-converter': 'teal',
  'ai-assistant': 'pink',
};

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
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
  private i18n = inject(I18nService);
  /** Names and descriptions in the current language (the API sends English); search matches what the user sees. */
  localized = computed(() => {
    this.i18n.lang();
    return this.tools().map((t) => ({
      ...t,
      name: this.i18n.tOr(`tool.${t.slug}`, t.name),
      description: this.i18n.tOr(`tool.${t.slug}.desc`, t.description),
      category: this.i18n.tOr(`category.${t.category}`, t.category),
    }));
  });
  filtered = computed(() => this.localized().filter((t) => (t.name + t.description).toLowerCase().includes(this.query().toLowerCase())));
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
