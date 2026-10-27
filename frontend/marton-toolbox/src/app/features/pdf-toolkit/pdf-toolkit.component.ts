import { Component, signal } from '@angular/core';
import JSZip from 'jszip';
import { PDFDocument, degrees } from 'pdf-lib';

type Mode = 'merge' | 'organize' | 'split';
interface MergeItem { id: number; file: File; kind: 'pdf' | 'image'; pages: number; }
interface PageItem { id: number; index: number; rotation: number; }

let nextId = 1;

@Component({
  standalone: true,
  styles: [`
    .tabs{display:inline-flex;gap:4px;flex-wrap:wrap;margin:28px 0 18px;padding:4px;background:#eceef5;border-radius:12px}
    .tabs button{border:0;background:transparent;color:var(--text-2);border-radius:9px;padding:8px 16px;font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
    .tabs button:hover{color:var(--text)}
    .tabs button.active{background:#fff;color:var(--brand-ink);box-shadow:var(--shadow-sm)}
    .resizer{margin-top:0}
    .error-text{margin-bottom:14px}
    .row-actions{margin-left:auto;display:flex;gap:4px}
    .row-actions button{border:1px solid var(--border);background:#fff;border-radius:8px;min-width:30px;height:30px;color:var(--text-2);cursor:pointer;font-size:14px;transition:background .15s,color .15s,border-color .15s}
    .row-actions button:hover:not(:disabled){background:var(--brand-soft);color:var(--brand-ink);border-color:#c7d2fe}
    .row-actions button:disabled{opacity:.35;cursor:default}
    .file-badge{width:44px;height:54px;border-radius:8px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
    .page-grid{width:100%;align-self:stretch;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;align-content:start}
    .page-card{border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff;transition:box-shadow .2s,border-color .2s;display:flex;flex-direction:column;align-items:center;gap:8px}
    .page-sheet{width:62px;height:80px;border:1px solid var(--border-strong);border-radius:4px;background:linear-gradient(180deg,#fff,#f6f7fc);box-shadow:var(--shadow-sm);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--brand);transition:transform .2s}
    .page-card small{color:#78839a;font-size:12px}
    .page-card .row-actions{margin:0;flex-wrap:wrap;justify-content:center}
    .hint{font-size:12px;color:#78839a;margin:-6px 0 0}
    .radio{font-size:14px;color:#40506d;display:flex;align-items:center;gap:8px}
  `],
  template: `<section class="page tool-page">
    <p class="eyebrow">FILE TOOLS</p>
    <h1>PDF Toolkit</h1>
    <p class="lead">Merge, reorder, rotate, and split PDFs right in your browser. Your files are never uploaded.</p>

    <div class="tabs">
      <button [class.active]="mode() === 'merge'" (click)="setMode('merge')">Merge</button>
      <button [class.active]="mode() === 'organize'" (click)="setMode('organize')">Organize pages</button>
      <button [class.active]="mode() === 'split'" (click)="setMode('split')">Split</button>
    </div>
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    @if (mode() === 'merge') {
      <div class="resizer">
        <div class="controls">
          <label class="drop-zone compact">
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple (change)="addToMerge($event)">
            <span class="drop-icon">⇧</span><strong>Add PDFs or images</strong><small>JPG, PNG, and WebP become full pages.</small>
          </label>
          <p class="hint">Files are combined in the order shown. Use the arrows to reorder.</p>
          <button class="primary" [disabled]="mergeItems().length < 1 || busy()" (click)="downloadMerged()">
            {{ busy() ? 'Working…' : 'Download merged PDF ↓' }}
          </button>
        </div>
        <div class="resize-preview">
          @if (mergeItems().length) {
            <div class="image-list">
              @for (item of mergeItems(); track item.id; let i = $index; let last = $last) {
                <article>
                  <span class="file-badge">{{ item.kind === 'pdf' ? 'PDF' : 'IMG' }}</span>
                  <div><strong>{{ item.file.name }}</strong><span>{{ item.pages }} {{ item.pages === 1 ? 'page' : 'pages' }}</span></div>
                  <div class="row-actions">
                    <button title="Move up" [disabled]="i === 0" (click)="move(mergeItems, i, -1)">↑</button>
                    <button title="Move down" [disabled]="last" (click)="move(mergeItems, i, 1)">↓</button>
                    <button title="Remove" (click)="removeItem(item)">×</button>
                  </div>
                </article>
              }
            </div>
          } @else { <div class="empty-preview">Add two or more PDFs or images<br>to combine them into one PDF.</div> }
        </div>
      </div>
    }

    @if (mode() === 'organize') {
      <div class="resizer">
        <div class="controls">
          <label class="drop-zone compact">
            <input type="file" accept="application/pdf" (change)="loadForOrganize($event)">
            <span class="drop-icon">⇧</span><strong>{{ sourceFile()?.name || 'Choose a PDF' }}</strong><small>Reorder, rotate, or delete pages.</small>
          </label>
          @if (pages().length) {
            <p class="hint">{{ pages().length }} of {{ sourcePageCount() }} pages kept.</p>
            <button class="secondary" (click)="rotateAll(90)">Rotate all ↻</button>
            <button class="secondary" (click)="resetPages()">Reset changes</button>
          }
          <button class="primary" [disabled]="!pages().length || busy()" (click)="downloadOrganized()">
            {{ busy() ? 'Working…' : 'Download PDF ↓' }}
          </button>
        </div>
        <div class="resize-preview">
          @if (pages().length) {
            <div class="page-grid">
              @for (page of pages(); track page.id; let i = $index; let last = $last) {
                <div class="page-card">
                  <div class="page-sheet" [style.transform]="'rotate(' + page.rotation + 'deg)'">{{ page.index + 1 }}</div>
                  <small>Position {{ i + 1 }}</small>
                  <div class="row-actions">
                    <button title="Move earlier" [disabled]="i === 0" (click)="move(pages, i, -1)">←</button>
                    <button title="Move later" [disabled]="last" (click)="move(pages, i, 1)">→</button>
                    <button title="Rotate left" (click)="rotate(page, -90)">↺</button>
                    <button title="Rotate right" (click)="rotate(page, 90)">↻</button>
                    <button title="Delete page" [disabled]="pages().length === 1" (click)="removePage(page)">×</button>
                  </div>
                </div>
              }
            </div>
          } @else { <div class="empty-preview">Choose a PDF to see<br>and rearrange its pages.</div> }
        </div>
      </div>
    }

    @if (mode() === 'split') {
      <div class="resizer">
        <div class="controls">
          <label class="drop-zone compact">
            <input type="file" accept="application/pdf" (change)="loadForSplit($event)">
            <span class="drop-icon">⇧</span><strong>{{ sourceFile()?.name || 'Choose a PDF' }}</strong><small>Split into separate files.</small>
          </label>
          <label class="radio"><input type="radio" name="split" [checked]="splitMode() === 'each'" (change)="splitMode.set('each')"> Every page as its own file</label>
          <label class="radio"><input type="radio" name="split" [checked]="splitMode() === 'ranges'" (change)="splitMode.set('ranges')"> Custom ranges</label>
          @if (splitMode() === 'ranges') {
            <label>Ranges<input type="text" placeholder="e.g. 1-3, 4, 5-8" [value]="ranges()" (input)="ranges.set($any($event.target).value)"></label>
            <p class="hint">Each range becomes one file.</p>
          }
          <button class="primary" [disabled]="!sourcePageCount() || busy()" (click)="downloadSplit()">
            {{ busy() ? 'Working…' : 'Download split files ↓' }}
          </button>
        </div>
        <div class="resize-preview">
          @if (sourcePageCount()) {
            <div class="empty-preview">
              <strong>{{ sourcePageCount() }} pages</strong><br>
              {{ splitPreview() }}
            </div>
          } @else { <div class="empty-preview">Choose a PDF to split it<br>into smaller files.</div> }
        </div>
      </div>
    }
  </section>`
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

  setMode(mode: Mode) { this.mode.set(mode); this.error.set(''); }

  async addToMerge(event: Event) {
    this.error.set('');
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      try {
        if (file.type === 'application/pdf') {
          const doc = await loadPdf(await file.arrayBuffer());
          this.mergeItems.update(x => [...x, { id: nextId++, file, kind: 'pdf', pages: doc.getPageCount() }]);
        } else {
          this.mergeItems.update(x => [...x, { id: nextId++, file, kind: 'image', pages: 1 }]);
        }
      } catch (err) { this.error.set(describe(err, file.name)); }
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

  removeItem(item: MergeItem) { this.mergeItems.update(x => x.filter(y => y !== item)); }

  removePage(page: PageItem) { this.pages.update(x => x.filter(y => y !== page)); }

  async loadForOrganize(event: Event) { await this.loadSource(event); this.resetPages(); }

  async loadForSplit(event: Event) { await this.loadSource(event); }

  resetPages() {
    this.pages.set(this.sourceRotations.map((rotation, index) => ({ id: nextId++, index, rotation })));
  }

  rotate(page: PageItem, delta: number) {
    this.pages.update(x => x.map(p => p === page ? { ...p, rotation: normalize(p.rotation + delta) } : p));
  }

  rotateAll(delta: number) { this.pages.update(x => x.map(p => ({ ...p, rotation: normalize(p.rotation + delta) }))); }

  async downloadOrganized() {
    await this.run(async () => {
      const src = await loadPdf(this.sourceBytes!);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, this.pages().map(p => p.index));
      copied.forEach((page, i) => { page.setRotation(degrees(this.pages()[i].rotation)); out.addPage(page); });
      save(await out.save(), `${baseName(this.sourceFile()!.name)}-edited.pdf`);
    });
  }

  splitPreview(): string {
    if (this.splitMode() === 'each') return `Creates ${this.sourcePageCount()} files, one per page.`;
    try {
      const groups = parseRanges(this.ranges(), this.sourcePageCount());
      return `Creates ${groups.length} ${groups.length === 1 ? 'file' : 'files'}: ${groups.map(g => label(g)).join(', ')}.`;
    } catch (err) { return (err as Error).message; }
  }

  async downloadSplit() {
    await this.run(async () => {
      const count = this.sourcePageCount();
      const groups = this.splitMode() === 'each'
        ? Array.from({ length: count }, (_, i) => [i])
        : parseRanges(this.ranges(), count);
      const src = await loadPdf(this.sourceBytes!);
      const name = baseName(this.sourceFile()!.name);

      const files: { name: string; bytes: Uint8Array }[] = [];
      for (const group of groups) {
        const out = await PDFDocument.create();
        for (const page of await out.copyPages(src, group)) out.addPage(page);
        files.push({ name: `${name}-${label(group).replace(/ /g, '')}.pdf`, bytes: await out.save() });
      }

      if (files.length === 1) { save(files[0].bytes, files[0].name); return; }
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.bytes);
      save(await zip.generateAsync({ type: 'blob' }), `${name}-split.zip`);
    });
  }

  move<T>(list: { update(fn: (x: T[]) => T[]): void }, index: number, delta: number) {
    list.update(x => {
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
      this.sourceRotations = doc.getPages().map(p => normalize(p.getRotation().angle));
      this.sourceFile.set(file);
      this.sourcePageCount.set(doc.getPageCount());
    } catch (err) { this.error.set(describe(err, file.name)); }
  }

  private async run(work: () => Promise<void>) {
    this.error.set('');
    this.busy.set(true);
    try { await work(); } catch (err) { this.error.set(describe(err)); } finally { this.busy.set(false); }
  }
}

async function loadPdf(bytes: ArrayBuffer) {
  // pdf-lib can't decrypt, so password-protected files fail here with a clear message.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/** Adds an image as a page sized to the image (1px = 0.75pt, i.e. 96 dpi). WebP goes via canvas since pdf-lib only embeds JPG/PNG. */
async function addImagePage(doc: PDFDocument, file: File) {
  const image = file.type === 'image/jpeg'
    ? await doc.embedJpg(await file.arrayBuffer())
    : await doc.embedPng(file.type === 'image/png' ? await file.arrayBuffer() : await toPng(file));
  const width = image.width * 0.75, height = image.height * 0.75;
  doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
}

function toPng(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? b.arrayBuffer().then(resolve, reject) : reject(new Error('Could not convert image.')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read image ${file.name}.`)); };
    img.src = url;
  });
}

/** "1-3, 5, 7-" → [[0,1,2],[4],[6..last]] (zero-based). Throws a user-facing message on bad input. */
export function parseRanges(input: string, pageCount: number): number[][] {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter at least one page range, e.g. 1-3, 5.');
  return parts.map(part => {
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

function normalize(angle: number) { return ((angle % 360) + 360) % 360; }

function baseName(name: string) { return name.replace(/\.pdf$/i, ''); }

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
