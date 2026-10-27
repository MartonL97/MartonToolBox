import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const MAX_BYTES = 25_000_000;
const TARGETS: Record<string, { target: string; label: string } | undefined> = {
  pdf: { target: 'docx', label: 'Word (.docx)' },
  ...Object.fromEntries(['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'].map(ext => [ext, { target: 'pdf', label: 'PDF' }]))
};
const ACCEPT = Object.keys(TARGETS).map(ext => '.' + ext).join(',');

@Component({
  standalone: true,
  styles: [`
    .direction{display:flex;align-items:center;gap:10px;font-size:15px;color:#2c3b59}
    .direction b{background:var(--brand-soft);color:var(--brand-ink);border-radius:8px;padding:6px 10px;font-size:13px}
    .hint{font-size:12px;color:#78839a;margin:0;line-height:1.5}
    .done{color:var(--success);font-size:14px;margin:0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 12px}
  `],
  template: `<section class="page tool-page">
    <p class="eyebrow">FILE TOOLS</p>
    <h1>Document Converter</h1>
    <p class="lead">Convert PDF to Word, or Word, Excel, and PowerPoint files to PDF.</p>

    <div class="resizer">
      <div class="controls">
        <label class="drop-zone compact">
          <input type="file" [accept]="accept" (change)="choose($event)">
          <span class="drop-icon">⇧</span><strong>{{ file()?.name || 'Choose a document' }}</strong>
          <small>PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT, RTF · up to 25 MB</small>
        </label>
        @if (conversion(); as c) {
          <div class="direction"><b>{{ extension().toUpperCase() }}</b> → <b>{{ c.label }}</b></div>
        }
        @if (error()) { <p class="error-text">{{ error() }}</p> }
        @if (doneName()) { <p class="done">✓ Downloaded {{ doneName() }}</p> }
        <button class="primary" [disabled]="!conversion() || busy()" (click)="convert()">
          {{ busy() ? 'Converting…' : 'Convert & download ↓' }}
        </button>
        <p class="hint">Unlike the other tools, conversion runs on our server. Your file is deleted right after it's converted and is never stored.</p>
      </div>
      <div class="resize-preview">
        <div class="empty-preview">
          @if (busy()) { Converting {{ file()?.name }}…<br>Large documents can take up to a minute. }
          @else if (extension() === 'pdf') { PDF → Word keeps text, paragraphs, and images.<br>Complex layouts may need a little touch-up. }
          @else if (file()) { Ready to convert to {{ conversion()?.label }}. }
          @else { Choose a document<br>to convert it. }
        </div>
      </div>
    </div>
  </section>`
})
export class DocumentConverterComponent {
  private http = inject(HttpClient);
  accept = ACCEPT;
  file = signal<File | null>(null);
  busy = signal(false);
  error = signal('');
  doneName = signal('');
  extension = computed(() => (this.file()?.name.split('.').pop() ?? '').toLowerCase());
  conversion = computed(() => TARGETS[this.extension()] ?? null);

  choose(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.error.set('');
    this.doneName.set('');
    if (!file) return;
    if (file.size > MAX_BYTES) { this.error.set('That file is larger than 25 MB.'); return; }
    this.file.set(file);
    if (!this.conversion()) this.error.set('This file type isn\'t supported.');
  }

  async convert() {
    const file = this.file(), c = this.conversion();
    if (!file || !c) return;
    this.error.set('');
    this.doneName.set('');
    this.busy.set(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('target', c.target);
      const blob = await firstValueFrom(this.http.post('/api/documents/convert', form, { responseType: 'blob' }));
      const name = file.name.replace(/\.[^.]+$/, '') + '.' + c.target;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.doneName.set(name);
    } catch (err) {
      this.error.set(await errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

/** With responseType 'blob', error bodies arrive as a Blob holding the JSON { error }. */
async function errorMessage(err: unknown): Promise<string> {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 402) return 'An active license is required to use this tool.';
    if (err.status === 413) return 'That file is too large.';
    try {
      const body = err.error instanceof Blob ? JSON.parse(await err.error.text()) : err.error;
      if (body?.error) return body.error;
    } catch { /* fall through */ }
  }
  return 'The conversion failed. Please try again.';
}
