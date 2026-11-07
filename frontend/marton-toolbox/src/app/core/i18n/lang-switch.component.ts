import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { LANGS, Lang } from './define';
import { I18nService } from './i18n.service';
import { TranslatePipe } from './translate.pipe';

const NAMES: Record<Lang, string> = { en: 'English', ro: 'Română', hu: 'Magyar' };

/** A flag drawn as SVG (emoji flags show up as plain letters on Windows). */
@Component({
  selector: 'mtb-flag',
  standalone: true,
  host: { class: 'flag' },
  template: `
    @switch (lang()) {
      @case ('ro') {
        <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true">
          <rect width="1" height="2" fill="#002B7F" />
          <rect x="1" width="1" height="2" fill="#FCD116" />
          <rect x="2" width="1" height="2" fill="#CE1126" />
        </svg>
      }
      @case ('hu') {
        <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true">
          <rect width="3" height="0.667" fill="#CD2A3E" />
          <rect y="0.667" width="3" height="0.667" fill="#FFFFFF" />
          <rect y="1.333" width="3" height="0.667" fill="#436F4D" />
        </svg>
      }
      @default {
        <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <clipPath id="mtb-uk-diag"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
          <rect width="60" height="30" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#mtb-uk-diag)" stroke="#C8102E" stroke-width="4" />
          <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10" />
          <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6" />
        </svg>
      }
    }
  `,
})
export class FlagComponent {
  lang = input.required<Lang>();
}

/** The language picker in the top bar: the current flag, opening a list of English / Română / Magyar. */
@Component({
  selector: 'mtb-lang-switch',
  standalone: true,
  imports: [FlagComponent, TranslatePipe],
  template: `
    <button
      type="button"
      class="lang-button"
      (click)="open.set(!open())"
      [attr.aria-expanded]="open()"
      aria-haspopup="menu"
      [attr.aria-label]="'lang.choose' | t"
      [title]="'lang.choose' | t"
    >
      <mtb-flag [lang]="i18n.lang()" />
      <span class="lang-code">{{ i18n.lang().toUpperCase() }}</span>
    </button>
    @if (open()) {
      <div class="menu lang-menu" role="menu">
        @for (l of langs; track l) {
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="l === i18n.lang()"
            [class.current]="l === i18n.lang()"
            (click)="pick(l)"
          >
            <mtb-flag [lang]="l" />
            <span>{{ names[l] }}</span>
            <span class="lang-code">{{ l.toUpperCase() }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class LangSwitchComponent {
  i18n = inject(I18nService);
  private host = inject(ElementRef<HTMLElement>);
  langs = LANGS;
  names = NAMES;
  open = signal(false);

  pick(lang: Lang) {
    this.i18n.use(lang);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.open.set(false);
  }
}
