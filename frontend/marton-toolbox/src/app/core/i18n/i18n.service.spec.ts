import { TestBed } from '@angular/core/testing';
import { I18nService, LANG_KEY } from './i18n.service';
import { MESSAGES } from './messages';
import { LANGS } from './define';

describe('I18nService', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LANG_KEY, 'en');
    TestBed.configureTestingModule({});
  });
  afterEach(() => localStorage.clear());

  it('switches language, remembers it and sets the page language', () => {
    const i18n = TestBed.inject(I18nService);
    expect(i18n.t('nav.shop')).toBe('Shop');

    i18n.use('ro');
    expect(i18n.t('nav.shop')).toBe('Magazin');
    expect(document.documentElement.lang).toBe('ro');
    expect(localStorage.getItem(LANG_KEY)).toBe('ro');

    i18n.use('hu');
    expect(i18n.t('nav.shop')).toBe('Bolt');
    expect(i18n.locale()).toBe('hu');
  });

  it('starts in the saved language', () => {
    localStorage.setItem(LANG_KEY, 'hu');
    expect(TestBed.inject(I18nService).lang()).toBe('hu');
  });

  it('fills placeholders and picks the right plural form', () => {
    const i18n = TestBed.inject(I18nService);
    expect(i18n.t('shop.only_left', { n: 2 })).toBe('Only 2 left');
    expect(i18n.plural('shop.products', 1)).toBe('1 product');
    expect(i18n.plural('shop.products', 3)).toBe('3 products');

    // Romanian has three forms: 1 produs, 2 produse, 20 de produse.
    i18n.use('ro');
    expect(i18n.plural('shop.products', 1)).toBe('1 produs');
    expect(i18n.plural('shop.products', 2)).toBe('2 produse');
    expect(i18n.plural('shop.products', 20)).toBe('20 de produse');
  });

  it('shows unknown keys as-is and falls back for unknown tools', () => {
    const i18n = TestBed.inject(I18nService);
    expect(i18n.t('no.such.key')).toBe('no.such.key');
    expect(i18n.tOr('tool.brand-new', 'Brand New Tool')).toBe('Brand New Tool');
  });

  it('translates the API messages it knows, including ones with values', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.use('ro');
    expect(i18n.server('Invalid email or password.')).toBe('Email sau parolă incorectă.');
    expect(i18n.server('Too many wrong password attempts. Try again in 12 minutes, or reset your password.')).toContain('12 min');
    expect(i18n.server('Please choose a size for Tee.')).toBe('Te rugăm să alegi o mărime pentru Tee.');
    expect(i18n.server('Something new from the server.')).toBe('Something new from the server.');
    expect(i18n.server(null)).toBe(i18n.t('common.network_error'));
  });

  it('has every English text in Romanian and Hungarian', () => {
    const english = Object.keys(MESSAGES.en);
    for (const lang of LANGS) {
      const table = MESSAGES[lang];
      const missing = english.filter((k) => !table[k]);
      expect(missing).withContext(lang).toEqual([]);
    }
  });
});
