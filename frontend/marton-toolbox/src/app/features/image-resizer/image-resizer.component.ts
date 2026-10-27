import { Component, signal } from '@angular/core';
import JSZip from 'jszip';
const presets = {
  'Instagram Square': [1080, 1080],
  'Instagram Portrait': [1080, 1350],
  'LinkedIn Post': [1200, 627],
  'X / Twitter Post': [1600, 900],
  'Facebook Post': [1200, 630],
  'YouTube Thumbnail': [1280, 720],
};
@Component({ standalone: true, templateUrl: './image-resizer.component.html', styleUrl: './image-resizer.component.scss' })
export class ImageResizerComponent {
  files = signal<{ file: File; url: string; width: number; height: number }[]>([]);
  width = signal(1080);
  height = signal(1080);
  locked = signal(true);
  ratio = 1;
  presetEntries = Object.entries(presets);
  load(e: Event) {
    for (const file of Array.from((e.target as HTMLInputElement).files || [])) {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        this.files.update((x) => [...x, { file, url, width: img.width, height: img.height }]);
        if (this.files().length === 1) {
          this.ratio = img.width / img.height;
          this.width.set(img.width);
          this.height.set(img.height);
        }
      };
      img.src = url;
    }
  }
  changeWidth(v: number) {
    this.width.set(v);
    if (this.locked()) this.height.set(Math.round(v / this.ratio));
  }
  changeHeight(v: number) {
    this.height.set(v);
    if (this.locked()) this.width.set(Math.round(v * this.ratio));
  }
  preset(name: string) {
    if (!name) return;
    const [w, h] = presets[name as keyof typeof presets];
    this.width.set(w);
    this.height.set(h);
  }
  remove(item: any) {
    URL.revokeObjectURL(item.url);
    this.files.update((x) => x.filter((y) => y !== item));
  }
  async download() {
    const zip = new JSZip(),
      w = this.width(),
      h = this.height();
    for (const item of this.files()) {
      zip.file(item.file.name.replace(/\.[^.]+$/, '') + `-${w}x${h}.png`, await resizeBlob(item.file, w, h));
    }
    const archive = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(archive);
    a.download = 'marton-toolbox-resized-images.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
function resizeBlob(file: File, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create resized image.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = URL.createObjectURL(file);
  });
}
