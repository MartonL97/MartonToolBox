import { Injectable, computed, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEnGb from '@angular/common/locales/en-GB';
import localeRo from '@angular/common/locales/ro';
import localeHu from '@angular/common/locales/hu';
import { LANGS, Lang } from './define';
import { MESSAGES } from './messages';
import { SERVER_PATTERNS, SERVER_TEXTS } from './messages/server';

registerLocaleData(localeEnGb);
registerLocaleData(localeRo);
registerLocaleData(localeHu);

export const LANG_KEY = 'mtb_lang';
/** Locale ids for dates and numbers (the date pipe, Intl). */
const LOCALES: Record<Lang, string> = { en: 'en-GB', ro: 'ro', hu: 'hu' };

export type Params = Record<string, string | number>;

/**
 * The site's language (English, Romanian, Hungarian), switchable at any time from the flag in the top bar.
 * The choice is remembered in this browser; a first visit follows the browser's language.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(initialLang());
  readonly locale = computed(() => LOCALES[this.lang()]);

  constructor() {
    this.apply(this.lang());
  }

  use(lang: Lang) {
    this.lang.set(lang);
    this.apply(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
  }

  /** The text for a key in the current language, with {placeholders} filled in. Unknown keys show as-is. */
  t(key: string, params?: Params): string {
    const lang = this.lang();
    const text = (MESSAGES[lang] as Record<string, string>)[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key;
    return params ? fill(text, params) : text;
  }

  /** The text for a key, or the fallback when no language has it (e.g. a tool added on the server but not here yet). */
  tOr(key: string, fallback: string): string {
    const text = (MESSAGES[this.lang()] as Record<string, string>)[key] ?? (MESSAGES.en as Record<string, string>)[key];
    return text ?? fallback;
  }

  /**
   * A message from the API (always English) in the current language. Unknown messages are shown unchanged;
   * an empty one becomes the fallback key's text.
   */
  server(text: string | null | undefined, fallbackKey = 'common.network_error'): string {
    if (!text) return this.t(fallbackKey);
    const key = SERVER_TEXTS[text];
    if (key) return this.t(key);
    for (const p of SERVER_PATTERNS) {
      const m = p.re.exec(text);
      if (m) return this.t(p.key, Object.fromEntries(p.params.map((name, i) => [name, m[i + 1]])));
    }
    return text;
  }

  /** A counted text: picks key.one / key.few / key.other for n, and fills {n}. */
  plural(key: string, n: number, params?: Params): string {
    const table = MESSAGES[this.lang()] as Record<string, string>;
    const category = new Intl.PluralRules(this.locale()).select(n);
    const text = table[`${key}.${category}`] ?? table[`${key}.other`] ?? key;
    return fill(text, { n, ...params });
  }

  private apply(lang: Lang) {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }
}

function fill(text: string, params: Params) {
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    /* fall through */
  }
  const browser = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(browser as Lang) ? (browser as Lang) : 'en';
}
