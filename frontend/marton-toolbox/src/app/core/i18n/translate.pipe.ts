import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { I18nService, Params } from './i18n.service';

/**
 * {{ 'shop.title' | t }} or {{ 'cart.add_more' | t: { amount: x } }}.
 * Not pure, so every text follows a language switch right away (a lookup is cheap).
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(key: string, params?: Params): string {
    return this.i18n.t(key, params);
  }
}

/** {{ 'shop.products' | tn: count }} → "1 product", "3 products" (or the Romanian/Hungarian form). */
@Pipe({ name: 'tn', standalone: true, pure: false })
export class PluralPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(key: string, n: number, params?: Params): string {
    return this.i18n.plural(key, n, params);
  }
}

/** Dates in the current language: {{ value | ldate: 'd MMM y' }}. */
@Pipe({ name: 'ldate', standalone: true, pure: false })
export class LocalDatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  private cache = { key: '', out: '' };
  transform(value: string | Date | null | undefined, format = 'd MMM y'): string {
    if (value == null || value === '') return '';
    const key = `${value}|${format}|${this.i18n.locale()}`;
    if (this.cache.key !== key) this.cache = { key, out: formatDateSafe(value, format, this.i18n.locale()) };
    return this.cache.out;
  }
}

function formatDateSafe(value: string | Date, format: string, locale: string) {
  try {
    return formatDate(value, format, locale);
  } catch {
    return String(value);
  }
}

export const I18N = [TranslatePipe, PluralPipe, LocalDatePipe] as const;
