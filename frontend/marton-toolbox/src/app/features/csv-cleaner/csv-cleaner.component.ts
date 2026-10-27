import { Component, signal } from '@angular/core';
@Component({ standalone: true, templateUrl: './csv-cleaner.component.html', styleUrl: './csv-cleaner.component.scss' })
export class CsvCleanerComponent {
  Math = Math;
  file = signal<File | null>(null);
  headers = signal<string[]>([]);
  rows = signal<string[][]>([]);
  dedupe = signal(true);
  empty = signal(true);
  trim = signal(true);
  stats = () => [
    { label: 'Rows', value: this.rows().length },
    { label: 'Columns', value: this.headers().length },
    { label: 'Duplicates', value: this.duplicates() },
    { label: 'Empty rows', value: this.rows().filter((r) => r.every((x) => !x.trim())).length },
  ];
  load(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.file.set(f);
    f.text().then((t) => {
      const all = t.trimEnd().split(/\r?\n/).map(parse);
      this.headers.set(all.shift() || []);
      this.rows.set(all);
    });
  }
  duplicates() {
    const seen = new Set<string>();
    return this.rows().filter((r) => {
      const k = r.join('\u001f');
      if (seen.has(k)) return true;
      seen.add(k);
      return false;
    }).length;
  }
  download() {
    let rows = this.rows();
    if (this.empty()) rows = rows.filter((r) => r.some((x) => x.trim()));
    if (this.trim()) rows = rows.map((r) => r.map((x) => x.trim()));
    if (this.dedupe()) {
      const s = new Set<string>();
      rows = rows.filter((r) => !s.has(r.join('\u001f')) && !!s.add(r.join('\u001f')));
    }
    const csv = [this.headers(), ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
    save(new Blob([csv], { type: 'text/csv' }), 'cleaned.csv');
  }
}
function parse(line: string) {
  const out: string[] = [];
  let v = '',
    q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      v += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(v);
      v = '';
    } else v += c;
  }
  out.push(v);
  return out;
}
function escapeCsv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
