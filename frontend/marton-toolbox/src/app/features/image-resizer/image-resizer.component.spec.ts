import { ImageResizerComponent } from './image-resizer.component';
import { render, text } from '../../../testing/test-helpers';

describe('ImageResizerComponent', () => {
  it('starts empty with the download button disabled', () => {
    const { el } = render(ImageResizerComponent);
    expect(text(el.querySelector('.empty-preview'))).toContain('Upload one or more images');
    expect((el.querySelector('button.primary') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('keeps the aspect ratio while the lock is on', () => {
    const { component } = render(ImageResizerComponent);
    component.ratio = 16 / 9;
    component.changeWidth(1600);
    expect(component.height()).toBe(900);
    component.changeHeight(450);
    expect(component.width()).toBe(800);
  });

  it('lets width and height change independently when unlocked', () => {
    const { component } = render(ImageResizerComponent);
    component.locked.set(false);
    component.changeWidth(500);
    expect(component.height()).toBe(1080);
  });

  it('applies social media presets', () => {
    const { component } = render(ImageResizerComponent);
    component.preset('YouTube Thumbnail');
    expect([component.width(), component.height()]).toEqual([1280, 720]);
    component.preset('');
    expect([component.width(), component.height()]).toEqual([1280, 720]);
  });

  it('offers every preset in the dropdown', () => {
    const { el } = render(ImageResizerComponent);
    const options = Array.from(el.querySelectorAll('select option')).map((o) => text(o));
    expect(options).toContain('Instagram Square — 1080 × 1080');
    expect(options.length).toBe(7); // "Custom dimensions" + 6 presets
  });
});
