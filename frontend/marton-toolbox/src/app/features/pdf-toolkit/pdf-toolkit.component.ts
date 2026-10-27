import { Component, signal } from '@angular/core';
import JSZip from 'jszip';
import { PDFDocument, degrees } from 'pdf-lib';

type Mode = 'merge' | 'organize' | 'split';
interface MergeItem {
  id: number;
  file: File;
  kind: 'pdf' | 'image';
  pages: number;
}
interface PageItem {
  id: number;
  index: number;
  rotation: number;
}

let nextId = 1;

@Component({
  standalone: true,
  styleUrl: './pdf-toolkit.component.scss',
  templateUrl: './pdf-toolkit.component.html',
})
export class PdfToolkitComponent {
  mode = signal<Mode>('merge');
  busy = signal(false);
  error = signal('');

  mergeItems = signal<MergeItem[]>([]);

  /** The single PDF used by Organize and Split. */
  sourceFile = signal<File | null>(null);
  sourcePageCount = signal(0);
  private sourceBytes: ArrayBuffer | null = null;
  private sourceRotations: number[] = [];
  pages = signal<PageItem[]>([]);

  splitMode = signal<'each' | 'ranges'>('each');
  ranges = signal('');

  setMode(mode: Mode) {
    this.mode.set(mode);
    this.error.set('');
  }

  async addToMerge(event: Event) {
    this.error.set('');
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      try {
        if (file.type === 'application/pdf') {
          const doc = await loadPdf(await file.arrayBuffer());
          this.mergeItems.update((x) => [...x, { id: nextId++, file, kind: 'pdf', pages: doc.getPageCount() }]);
        } else {
          this.mergeItems.update((x) => [...x, { id: nextId++, file, kind: 'image', pages: 1 }]);
        }
      } catch (err) {
        this.error.set(describe(err, file.name));
      }
    }
    input.value = '';
  }

  async downloadMerged() {
    await this.run(async () => {
      const out = await PDFDocument.create();
      for (const item of this.mergeItems()) {
        if (item.kind === 'pdf') {
          const doc = await loadPdf(await item.file.arrayBuffer());
          for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
        } else {
          await addImagePage(out, item.file);
        }
      }
      save(await out.save(), 'merged.pdf');
    });
  }

  removeItem(item: MergeItem) {
    this.mergeItems.update((x) => x.filter((y) => y !== item));
  }

  removePage(page: PageItem) {
    this.pages.update((x) => x.filter((y) => y !== page));
  }

  async loadForOrganize(event: Event) {
    await this.loadSource(event);
    this.resetPages();
  }

  async loadForSplit(event: Event) {
    await this.loadSource(event);
  }

  resetPages() {
    this.pages.set(this.sourceRotations.map((rotation, index) => ({ id: nextId++, index, rotation })));
  }

  rotate(page: PageItem, delta: number) {
    this.pages.update((x) => x.map((p) => (p === page ? { ...p, rotation: normalize(p.rotation + delta) } : p)));
  }

  rotateAll(delta: number) {
    this.pages.update((x) => x.map((p) => ({ ...p, rotation: normalize(p.rotation + delta) })));
  }

  async downloadOrganized() {
    await this.run(async () => {
      const src = await loadPdf(this.sourceBytes!);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(
        src,
        this.pages().map((p) => p.index),
      );
      copied.forEach((page, i) => {
        page.setRotation(degrees(this.pages()[i].rotation));
        out.addPage(page);
      });
      save(await out.save(), `${baseName(this.sourceFile()!.name)}-edited.pdf`);
    });
  }

  splitPreview(): string {
    if (this.splitMode() === 'each') return `Creates ${this.sourcePageCount()} files, one per page.`;
    try {
      const groups = parseRanges(this.ranges(), this.sourcePageCount());
      return `Creates ${groups.length} ${groups.length === 1 ? 'file' : 'files'}: ${groups.map((g) => label(g)).join(', ')}.`;
    } catch (err) {
      return (err as Error).message;
    }
  }

  async downloadSplit() {
    await this.run(async () => {
      const count = this.sourcePageCount();
      const groups = this.splitMode() === 'each' ? Array.from({ length: count }, (_, i) => [i]) : parseRanges(this.ranges(), count);
      const src = await loadPdf(this.sourceBytes!);
      const name = baseName(this.sourceFile()!.name);

      const files: { name: string; bytes: Uint8Array }[] = [];
      for (const group of groups) {
        const out = await PDFDocument.create();
        for (const page of await out.copyPages(src, group)) out.addPage(page);
        files.push({ name: `${name}-${label(group).replace(/ /g, '')}.pdf`, bytes: await out.save() });
      }

      if (files.length === 1) {
        save(files[0].bytes, files[0].name);
        return;
      }
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.bytes);
      save(await zip.generateAsync({ type: 'blob' }), `${name}-split.zip`);
    });
  }

  move<T>(list: { update(fn: (x: T[]) => T[]): void }, index: number, delta: number) {
    list.update((x) => {
      const copy = [...x];
      const [item] = copy.splice(index, 1);
      copy.splice(index + delta, 0, item);
      return copy;
    });
  }

  private async loadSource(event: Event) {
    this.error.set('');
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      const doc = await loadPdf(bytes);
      this.sourceBytes = bytes;
      this.sourceRotations = doc.getPages().map((p) => normalize(p.getRotation().angle));
      this.sourceFile.set(file);
      this.sourcePageCount.set(doc.getPageCount());
    } catch (err) {
      this.error.set(describe(err, file.name));
    }
  }

  private async run(work: () => Promise<void>) {
    this.error.set('');
    this.busy.set(true);
    try {
      await work();
    } catch (err) {
      this.error.set(describe(err));
    } finally {
      this.busy.set(false);
    }
  }
}

async function loadPdf(bytes: ArrayBuffer) {
  // pdf-lib can't decrypt, so password-protected files fail here with a clear message.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/** Adds an image as a page sized to the image (1px = 0.75pt, i.e. 96 dpi). WebP goes via canvas since pdf-lib only embeds JPG/PNG. */
async function addImagePage(doc: PDFDocument, file: File) {
  const image =
    file.type === 'image/jpeg'
      ? await doc.embedJpg(await file.arrayBuffer())
      : await doc.embedPng(file.type === 'image/png' ? await file.arrayBuffer() : await toPng(file));
  const width = image.width * 0.75,
    height = image.height * 0.75;
  doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
}

function toPng(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error('Could not convert image.'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image ${file.name}.`));
    };
    img.src = url;
  });
}

/** "1-3, 5, 7-" → [[0,1,2],[4],[6..last]] (zero-based). Throws a user-facing message on bad input. */
export function parseRanges(input: string, pageCount: number): number[][] {
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error('Enter at least one page range, e.g. 1-3, 5.');
  return parts.map((part) => {
    const match = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(part);
    if (!match || (!match[1] && !match[3])) throw new Error(`"${part}" isn't a valid range.`);
    const start = match[1] ? +match[1] : 1;
    const end = match[2] ? (match[3] ? +match[3] : pageCount) : start;
    if (start > end) throw new Error(`"${part}" runs backwards. Write the lower page first.`);
    if (start < 1 || end > pageCount) throw new Error(`"${part}" is outside pages 1–${pageCount}.`);
    return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  });
}

function label(group: number[]) {
  return group.length === 1 ? `p${group[0] + 1}` : `p${group[0] + 1}-${group[group.length - 1] + 1}`;
}

function normalize(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '');
}

function describe(err: unknown, fileName?: string) {
  const message = err instanceof Error ? err.message : String(err);
  const prefix = fileName ? `${fileName}: ` : '';
  if (/encrypt/i.test(message)) return `${prefix}password-protected PDFs aren't supported. Remove the password first.`;
  if (/parse|invalid|header/i.test(message)) return `${prefix}this doesn't look like a valid PDF.`;
  return prefix + message;
}

function save(data: Uint8Array | Blob, fileName: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
