import { CsvCleanerComponent } from './csv-cleaner.component';
import { render, text, waitFor } from '../../../testing/test-helpers';
import { captureDownloads, fileEvent } from '../../../testing/file-helpers';

const CSV = ['name,email', 'Ada, ada@example.com ', 'Ada, ada@example.com ', ',', '"Pop, Ion",ion@example.com'].join('\n');

describe('CsvCleanerComponent', () => {
  async function loaded() {
    const r = render(CsvCleanerComponent);
    r.component.load(fileEvent(new File([CSV], 'people.csv', { type: 'text/csv' })));
    await waitFor(() => r.component.headers().length > 0, r.fixture);
    return r;
  }

  it('starts with a drop zone', () => {
    const { el } = render(CsvCleanerComponent);
    expect(text(el.querySelector('.drop-zone strong'))).toBe('Drag & drop a CSV here');
  });

  it('parses the file, including quoted commas, and shows stats', async () => {
    const { component, el } = await loaded();
    expect(component.headers()).toEqual(['name', 'email']);
    expect(component.rows()[3]).toEqual(['Pop, Ion', 'ion@example.com']);
    const stats = Array.from(el.querySelectorAll('.stats > div')).map(
      (d) => `${text(d.querySelector('span'))} ${text(d.querySelector('strong'))}`,
    );
    expect(stats).toEqual(['Rows 4', 'Columns 2', 'Duplicates 1', 'Empty rows 1']);
  });

  it('downloads a cleaned CSV (deduplicated, trimmed, no empty rows)', async () => {
    const { component } = await loaded();
    const downloads = captureDownloads();
    component.download();
    expect(downloads[0].name).toBe('cleaned.csv');
    expect(await downloads[0].blob.text()).toBe(['name,email', 'Ada,ada@example.com', '"Pop, Ion",ion@example.com'].join('\n'));
  });

  it('respects the cleaning options', async () => {
    const { component } = await loaded();
    component.dedupe.set(false);
    component.trim.set(false);
    const downloads = captureDownloads();
    component.download();
    const lines = (await downloads[0].blob.text()).split('\n');
    expect(lines.filter((l) => l.startsWith('Ada')).length).toBe(2);
    expect(lines[1]).toBe('Ada, ada@example.com ');
  });
});
