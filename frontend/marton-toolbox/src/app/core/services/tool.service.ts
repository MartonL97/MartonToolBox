import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { Tool } from '../models/tool.model';
const fallback: Tool[] = [
  {
    slug: 'csv-cleaner',
    name: 'CSV Cleaner',
    description: 'Clean, deduplicate, and organize CSV files.',
    category: 'File Tools',
    icon: '▦',
    sortOrder: 1,
  },
  {
    slug: 'image-resizer',
    name: 'Image Resizer',
    description: 'Resize images for every social platform.',
    category: 'Image Tools',
    icon: '▧',
    sortOrder: 3,
  },
  {
    slug: 'pdf-toolkit',
    name: 'PDF Toolkit',
    description: 'Merge, split, reorder, and rotate PDFs privately.',
    category: 'File Tools',
    icon: '▤',
    sortOrder: 4,
  },
  {
    slug: 'document-converter',
    name: 'Document Converter',
    description: 'Convert PDF to Word, and Word, Excel, or PowerPoint to PDF.',
    category: 'File Tools',
    icon: '⇄',
    sortOrder: 5,
  },
];
@Injectable({ providedIn: 'root' })
export class ToolService {
  private http = inject(HttpClient);
  list() {
    return this.http.get<{ data: Tool[] }>('/api/tools').pipe(
      map((x) => x.data),
      catchError(() => of(fallback)),
    );
  }
}
