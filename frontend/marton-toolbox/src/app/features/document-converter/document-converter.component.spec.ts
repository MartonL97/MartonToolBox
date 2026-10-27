import { DocumentConverterComponent } from './document-converter.component';
import { TEST_USER, flushAll, render, settle, text } from '../../../testing/test-helpers';
import { captureDownloads, fileEvent } from '../../../testing/file-helpers';

describe('DocumentConverterComponent', () => {
  function setup() {
    const r = render(DocumentConverterComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: false } });
    return r;
  }

  it('picks the direction from the file type', () => {
    const { component, el, fixture } = setup();
    component.choose(fileEvent(new File(['%PDF'], 'contract.pdf')));
    fixture.detectChanges();
    expect(component.conversion()?.target).toBe('docx');
    expect(text(el.querySelector('.direction'))).toBe('PDF → Word (.docx)');

    component.choose(fileEvent(new File(['x'], 'budget.XLSX')));
    expect(component.conversion()?.target).toBe('pdf');
  });

  it('rejects unsupported types and files over 25 MB', () => {
    const { component } = setup();
    component.choose(fileEvent(new File(['x'], 'photo.png')));
    expect(component.error()).toBe("This file type isn't supported.");

    const big = new File(['x'], 'huge.pdf');
    Object.defineProperty(big, 'size', { value: 26_000_000 });
    component.choose(fileEvent(big));
    expect(component.error()).toBe('That file is larger than 25 MB.');
  });

  it('uploads the file with the target format and downloads the result', async () => {
    const { component, http, fixture, el } = setup();
    component.choose(fileEvent(new File(['%PDF'], 'contract.pdf')));
    const downloads = captureDownloads();
    const done = component.convert();

    const req = http.expectOne('/api/documents/convert');
    const form = req.request.body as FormData;
    expect((form.get('file') as File).name).toBe('contract.pdf');
    expect(form.get('target')).toBe('docx');
    req.flush(new Blob(['docx-bytes']));
    await done;
    fixture.detectChanges();

    expect(downloads[0].name).toBe('contract.docx');
    expect(text(el.querySelector('.done'))).toBe('✓ Downloaded contract.docx');
  });

  it('shows the server error message (sent as a Blob)', async () => {
    const { component, http, fixture } = setup();
    component.choose(fileEvent(new File(['%PDF'], 'contract.pdf')));
    const done = component.convert();
    http
      .expectOne('/api/documents/convert')
      .flush(new Blob([JSON.stringify({ error: "This file doesn't look like a valid .pdf file." })]), {
        status: 422,
        statusText: 'Unprocessable',
      });
    await done;
    await settle(fixture);
    expect(component.error()).toBe("This file doesn't look like a valid .pdf file.");
  });

  it('explains when a license is required', async () => {
    const { component, http } = setup();
    component.choose(fileEvent(new File(['%PDF'], 'contract.pdf')));
    const done = component.convert();
    http.expectOne('/api/documents/convert').flush(new Blob(['{}']), { status: 402, statusText: 'Payment Required' });
    await done;
    expect(component.error()).toBe('An active license is required to use this tool.');
  });
});
