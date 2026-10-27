import { PDFDocument } from 'pdf-lib';
import { PdfToolkitComponent, parseRanges } from './pdf-toolkit.component';
import { click, render, settle, text } from '../../../testing/test-helpers';
import { captureDownloads, fileEvent } from '../../../testing/file-helpers';

async function pdfFile(name: string, pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  return new File([await doc.save()], name, { type: 'application/pdf' });
}

async function pageCount(blob: Blob) {
  return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
}

describe('parseRanges', () => {
  it('turns "1-3, 5, 7-" into zero-based page groups', () => {
    expect(parseRanges('1-3, 5, 7-', 8)).toEqual([[0, 1, 2], [4], [6, 7]]);
  });

  it('explains bad input', () => {
    expect(() => parseRanges('', 8)).toThrowError(/at least one page range/);
    expect(() => parseRanges('abc', 8)).toThrowError(/isn't a valid range/);
    expect(() => parseRanges('4-2', 8)).toThrowError(/runs backwards/);
    expect(() => parseRanges('1-9', 8)).toThrowError(/outside pages 1–8/);
  });
});

describe('PdfToolkitComponent', () => {
  it('switches between Merge, Organize and Split', () => {
    const { el, fixture, component } = render(PdfToolkitComponent);
    const tabs = Array.from(el.querySelectorAll('.tabs button'));
    expect(tabs.map((t) => text(t))).toEqual(['Merge', 'Organize pages', 'Split']);
    click(tabs[2]);
    fixture.detectChanges();
    expect(component.mode()).toBe('split');
    expect(el.querySelector('.tabs button.active')?.textContent).toContain('Split');
  });

  it('merges PDFs in the chosen order', async () => {
    const { component, fixture } = render(PdfToolkitComponent);
    await component.addToMerge(fileEvent(await pdfFile('a.pdf', 2), await pdfFile('b.pdf', 3)));
    expect(component.mergeItems().map((i) => i.pages)).toEqual([2, 3]);

    component.move(component.mergeItems, 1, -1);
    expect(component.mergeItems().map((i) => i.file.name)).toEqual(['b.pdf', 'a.pdf']);

    const downloads = captureDownloads();
    await component.downloadMerged();
    await settle(fixture);
    expect(downloads[0].name).toBe('merged.pdf');
    expect(await pageCount(downloads[0].blob)).toBe(5);
  });

  it('rejects files that are not PDFs', async () => {
    const { component } = render(PdfToolkitComponent);
    await component.addToMerge(fileEvent(new File(['hello'], 'notes.pdf', { type: 'application/pdf' })));
    expect(component.error()).toContain("notes.pdf: this doesn't look like a valid PDF");
    expect(component.mergeItems()).toEqual([]);
  });

  it('reorders, rotates and deletes pages', async () => {
    const { component } = render(PdfToolkitComponent);
    await component.loadForOrganize(fileEvent(await pdfFile('doc.pdf', 3)));
    expect(component.pages().map((p) => p.index)).toEqual([0, 1, 2]);

    component.rotate(component.pages()[0], 90);
    component.removePage(component.pages()[1]);
    component.move(component.pages, 1, -1);
    expect(component.pages().map((p) => [p.index, p.rotation])).toEqual([
      [2, 0],
      [0, 90],
    ]);

    const downloads = captureDownloads();
    await component.downloadOrganized();
    const out = await PDFDocument.load(await downloads[0].blob.arrayBuffer());
    expect(downloads[0].name).toBe('doc-edited.pdf');
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90]);
  });

  it('splits by ranges into a ZIP', async () => {
    const { component } = render(PdfToolkitComponent);
    await component.loadForSplit(fileEvent(await pdfFile('report.pdf', 5)));
    component.splitMode.set('ranges');
    component.ranges.set('1-2, 5');
    expect(component.splitPreview()).toBe('Creates 2 files: p1-2, p5.');

    const downloads = captureDownloads();
    await component.downloadSplit();
    expect(downloads[0].name).toBe('report-split.zip');
  });

  it('downloads a single range as a plain PDF', async () => {
    const { component } = render(PdfToolkitComponent);
    await component.loadForSplit(fileEvent(await pdfFile('report.pdf', 5)));
    component.splitMode.set('ranges');
    component.ranges.set('2-4');
    const downloads = captureDownloads();
    await component.downloadSplit();
    expect(downloads[0].name).toBe('report-p2-4.pdf');
    expect(await pageCount(downloads[0].blob)).toBe(3);
  });
});
