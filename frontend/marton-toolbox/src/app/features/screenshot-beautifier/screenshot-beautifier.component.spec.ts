import { ScreenshotBeautifierComponent } from './screenshot-beautifier.component';
import { render, text } from '../../../testing/test-helpers';

describe('ScreenshotBeautifierComponent', () => {
  it('asks for a screenshot before showing the style controls', () => {
    const { el } = render(ScreenshotBeautifierComponent);
    expect(text(el.querySelector('.drop-zone strong'))).toBe('Upload a screenshot');
    expect(el.querySelector('input[type=range]')).toBeNull();
  });

  it('shows the style controls once an image is loaded', () => {
    const { el, component, fixture } = render(ScreenshotBeautifierComponent);
    component.image.set(new Image(40, 30));
    fixture.detectChanges();
    expect(el.querySelectorAll('input[type=range]').length).toBe(3); // padding, radius, rotation
    expect(text(el.querySelector('button.primary'))).toContain('Export PNG');
  });

  it('updates a style setting by name', () => {
    const { component } = render(ScreenshotBeautifierComponent);
    component.set('padding', 120);
    component.set('frame', false);
    expect(component.padding()).toBe(120);
    expect(component.frame()).toBeFalse();
  });

  it('starts with sensible defaults', () => {
    const { component } = render(ScreenshotBeautifierComponent);
    expect([component.padding(), component.radius(), component.rotation(), component.frame()]).toEqual([72, 26, 0, true]);
  });
});
