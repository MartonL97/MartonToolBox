import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

const MAX_BYTES = 25_000_000;
const TARGETS: Record<string, { target: string; label: string } | undefined> = {
  pdf: { target: 'docx', label: 'Word (.docx)' },
  ...Object.fromEntries(
    ['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'].map((ext) => [ext, { target: 'pdf', label: 'PDF' }]),
  ),
};
const ACCEPT = Object.keys(TARGETS)
  .map((ext) => '.' + ext)
  .join(',');

@Component({
  standalone: true,
  imports: [...I18N],
  styleUrl: './document-converter.component.scss',
  templateUrl: './document-converter.component.html',
})
export class DocumentConverterComponent {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
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
    if (file.size > MAX_BYTES) {
      this.error.set(this.i18n.t('doc.too_big'));
      return;
    }
    this.file.set(file);
    if (!this.conversion()) this.error.set(this.i18n.t('doc.unsupported'));
  }

  async convert() {
    const file = this.file(),
      c = this.conversion();
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
      this.error.set(await errorMessage(err, this.i18n));
    } finally {
      this.busy.set(false);
    }
  }
}

/** With responseType 'blob', error bodies arrive as a Blob holding the JSON { error }. */
async function errorMessage(err: unknown, i18n: I18nService): Promise<string> {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 402) return i18n.t('common.license_required');
    if (err.status === 413) return i18n.t('doc.too_large');
    try {
      const body = err.error instanceof Blob ? JSON.parse(await err.error.text()) : err.error;
      if (body?.error) return i18n.server(body.error);
    } catch {
      /* fall through */
    }
  }
  return i18n.t('doc.failed');
}
