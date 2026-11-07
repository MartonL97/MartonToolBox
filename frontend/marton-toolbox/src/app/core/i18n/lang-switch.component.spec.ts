import { TestBed } from '@angular/core/testing';
import { AppComponent } from '../../app.component';
import { click, render, text } from '../../../testing/test-helpers';
import { I18nService } from './i18n.service';

describe('LangSwitchComponent', () => {
  afterEach(() => TestBed.inject(I18nService).use('en'));

  it('shows the current flag in the top bar and switches the whole site', () => {
    const { el, fixture } = render(AppComponent);
    const button = el.querySelector('header .lang-button');
    expect(text(button)).toBe('EN');
    expect(el.querySelector('.lang-menu')).toBeNull();

    click(button);
    fixture.detectChanges();
    const options = Array.from(el.querySelectorAll('.lang-menu button'));
    expect(options.map((o) => text(o))).toEqual(['EnglishEN', 'RomânăRO', 'MagyarHU']);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options.every((o) => o.querySelector('mtb-flag svg'))).toBeTrue();

    click(options[1]);
    fixture.detectChanges();
    expect(el.querySelector('.lang-menu')).toBeNull();
    expect(text(el.querySelector('header .lang-button'))).toBe('RO');
    expect(text(el.querySelector('header a.account'))).toBe('Autentificare');
    expect(text(el.querySelector('aside nav'))).toContain('Magazin');
    expect(text(el.querySelector('aside nav'))).toContain('Asistent AI');

    click(el.querySelector('header .lang-button'));
    fixture.detectChanges();
    click(el.querySelectorAll('.lang-menu button')[2]);
    fixture.detectChanges();
    expect(text(el.querySelector('header a.account'))).toBe('Bejelentkezés');
  });

  it('closes when clicking elsewhere', () => {
    const { el, fixture } = render(AppComponent);
    click(el.querySelector('header .lang-button'));
    fixture.detectChanges();
    expect(el.querySelector('.lang-menu')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('.lang-menu')).toBeNull();
  });
});
