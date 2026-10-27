import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToolService } from '../../core/services/tool.service';
import { IconComponent } from '../../core/ui/icon.component';

/** The API stores icon names; the offline fallback list still uses the old glyphs. */
const GLYPH_TO_ICON: Record<string, string> = { '▦': 'table', '✦': 'sparkles', '▧': 'image', '▤': 'file', '⇄': 'convert' };
/** Each tool gets its own accent color (by slug, so it stays stable when the list is filtered). */
const TONES: Record<string, string> = { 'csv-cleaner': 'indigo', 'screenshot-beautifier': 'pink', 'image-resizer': 'violet', 'pdf-toolkit': 'amber', 'document-converter': 'teal' };

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section class="page">
    <div class="hero">
      <div class="hero-copy">
        <p class="eyebrow">{{ auth.user() ? 'Welcome back, ' + firstName() : 'Your everyday toolbox' }}</p>
        <h1>Useful tools, <span class="hero-accent">without the busywork.</span></h1>
        <p class="lead">Fast, private utilities for the small jobs that keep your work moving.</p>
        <label class="search"><mtb-icon name="search" /><input [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Search tools…"></label>
        <div class="hero-points"><span><mtb-icon name="shield" />Private by design</span><span><mtb-icon name="bolt" />Instant results</span><span><mtb-icon name="card" />One-time payment</span></div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="float-tile t1"><mtb-icon name="file" /></span>
        <span class="float-tile t2"><mtb-icon name="sparkles" /></span>
        <span class="float-tile t3"><mtb-icon name="table" /></span>
        <span class="float-tile t4"><mtb-icon name="image" /></span>
        <span class="float-tile t5"><mtb-icon name="convert" /></span>
      </div>
    </div>

    <div class="section-heading">
      <div><h2>Your toolbox</h2><p>Pick a tool to get started.</p></div>
      <span class="count">{{ filtered().length }} {{ filtered().length === 1 ? 'tool' : 'tools' }}</span>
    </div>
    <div class="tool-grid">
      @for (tool of filtered(); track tool.slug) {
        <a class="tool-card" [routerLink]="'/tools/' + tool.slug" [attr.data-tone]="tone(tool.slug)">
          <div class="tool-card-top"><span class="tool-icon"><mtb-icon [name]="icon(tool.icon)" /></span><span class="pill">{{ tool.category }}</span></div>
          <h3>{{ tool.name }}</h3>
          <p>{{ tool.description }}</p>
          <span class="open">Open tool <span class="open-arrow"><mtb-icon name="arrow" /></span></span>
        </a>
      } @empty {
        <p class="empty-preview">No tools match “{{ query() }}”.</p>
      }
    </div>
  </section>`
})
export class DashboardComponent {
  private service = inject(ToolService);
  auth = inject(AuthService);
  query = signal('');
  tools = signal<any[]>([]);
  filtered = computed(() => this.tools().filter(t => (t.name + t.description).toLowerCase().includes(this.query().toLowerCase())));
  firstName = computed(() => (this.auth.user()?.displayName ?? '').trim().split(/\s+/)[0]);
  constructor() { this.service.list().subscribe(x => this.tools.set(x)); }
  icon(name: string) { return GLYPH_TO_ICON[name] ?? name; }
  tone(slug: string) { return TONES[slug] ?? 'indigo'; }
}
