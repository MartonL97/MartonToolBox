/** A fake file-input change event carrying the given files. */
export function fileEvent(...files: File[]): Event {
  return { target: { files, value: 'C:\\fakepath\\x' } } as unknown as Event;
}

/**
 * Stops the browser from really downloading during a test and captures what would have been saved.
 * Returns the list of { name, blob } the component tried to download.
 */
export function captureDownloads() {
  const downloads: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
    const url = `blob:test/${n++}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  spyOn(URL, 'revokeObjectURL');
  spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  return downloads;
}
