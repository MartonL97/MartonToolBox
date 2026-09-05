import { Injectable, inject } from '@angular/core'; import { HttpClient } from '@angular/common/http'; import { catchError, map, of } from 'rxjs'; import { Tool } from '../models/tool.model';
const fallback: Tool[] = [
  { slug: 'csv-cleaner', name: 'CSV Cleaner', description: 'Clean, deduplicate, and organize CSV files.', category: 'File Tools', icon: '▦', sortOrder: 1 },
  { slug: 'screenshot-beautifier', name: 'Screenshot Beautifier', description: 'Turn ordinary screenshots into polished visuals.', category: 'Image Tools', icon: '✦', sortOrder: 2 },
  { slug: 'image-resizer', name: 'Image Resizer', description: 'Resize images for every social platform.', category: 'Image Tools', icon: '▧', sortOrder: 3 }
];
@Injectable({ providedIn: 'root' }) export class ToolService { private http = inject(HttpClient); list() { return this.http.get<{data: Tool[]}>('/api/tools').pipe(map(x => x.data), catchError(() => of(fallback))); } }
