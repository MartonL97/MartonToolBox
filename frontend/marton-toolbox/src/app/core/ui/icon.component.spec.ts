import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  function renderIcon(name: string) {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders an inline SVG that inherits the text color', () => {
    const svg = renderIcon('cart').querySelector('svg')!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.querySelectorAll('circle').length).toBe(2); // the cart's two wheels
  });

  it('is hidden from screen readers (decorative)', () => {
    expect(renderIcon('bolt').getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to the file icon for unknown names', () => {
    const unknown = renderIcon('does-not-exist').innerHTML;
    const file = renderIcon('file').innerHTML;
    expect(unknown).toBe(file);
  });
});
