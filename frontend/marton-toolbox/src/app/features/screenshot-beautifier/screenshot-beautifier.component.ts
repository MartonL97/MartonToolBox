import { Component, signal } from '@angular/core';
@Component({ standalone: true, templateUrl: './screenshot-beautifier.component.html', styleUrl: './screenshot-beautifier.component.scss' })
export class ScreenshotBeautifierComponent {
  image = signal<HTMLImageElement | null>(null);
  background = signal('#5068ff');
  padding = signal(72);
  radius = signal(26);
  rotation = signal(0);
  frame = signal(true);
  title = signal('');
  load(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      this.image.set(img);
      setTimeout(() => this.draw());
    };
    img.src = URL.createObjectURL(f);
  }
  set(key: string, value: any) {
    (this as any)[key].set(value);
    setTimeout(() => this.draw());
  }
  draw() {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas || !this.image()) return;
    const c = canvas.getContext('2d')!,
      img = this.image()!,
      p = this.padding(),
      w = 1200,
      h = 800;
    c.fillStyle = this.background();
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate((this.rotation() * Math.PI) / 180);
    const iw = w - p * 2,
      ih = Math.min((img.height / img.width) * iw, h - p * 2 - (this.title() ? 60 : 0));
    c.shadowColor = 'rgba(0,0,0,.28)';
    c.shadowBlur = 32;
    c.shadowOffsetY = 14;
    round(c, -iw / 2, -ih / 2 + (this.title() ? 25 : 0), iw, ih, this.radius());
    c.fillStyle = '#fff';
    c.fill();
    c.clip();
    c.drawImage(img, -iw / 2, -ih / 2 + (this.title() ? 25 : 0), iw, ih);
    c.restore();
    if (this.title()) {
      c.fillStyle = 'white';
      c.font = '600 28px system-ui';
      c.textAlign = 'center';
      c.fillText(this.title(), w / 2, 54);
    }
  }
  export() {
    this.draw();
    const canvas = document.querySelector('canvas')!;
    canvas.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b!);
      a.download = 'beautiful-screenshot.png';
      a.click();
    });
  }
}
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
