import { DashboardComponent } from './dashboard.component';
import { TEST_USER, flushAll, render, text, type } from '../../../testing/test-helpers';

const TOOLS = [
  { slug: 'csv-cleaner', name: 'CSV Cleaner', description: 'Clean CSV files.', category: 'File Tools', icon: 'table', sortOrder: 1 },
  { slug: 'pdf-toolkit', name: 'PDF Toolkit', description: 'Merge and split PDFs.', category: 'File Tools', icon: 'file', sortOrder: 4 },
  { slug: 'image-resizer', name: 'Image Resizer', description: 'Resize images.', category: 'Image Tools', icon: '▧', sortOrder: 3 },
];

describe('DashboardComponent', () => {
  function setup(loggedIn = false) {
    const r = render(DashboardComponent, loggedIn ? { user: TEST_USER } : {});
    flushAll(r.http, '/api/account', { data: { isAdmin: false } });
    r.http.expectOne('/api/tools').flush({ data: TOOLS });
    r.fixture.detectChanges();
    return r;
  }

  const cards = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLAnchorElement>('a.tool-card'));

  it('lists every tool as a card linking to the tool page', () => {
    const { el } = setup();
    expect(cards(el).map((c) => text(c.querySelector('h3')))).toEqual(['CSV Cleaner', 'PDF Toolkit', 'Image Resizer']);
    expect(cards(el)[1].getAttribute('href')).toBe('/tools/pdf-toolkit');
    expect(text(el.querySelector('.count'))).toBe('3 tools');
  });

  it('gives each tool its own accent color', () => {
    const tones = cards(setup().el).map((c) => c.dataset['tone']);
    expect(tones).toEqual(['indigo', 'amber', 'violet']);
  });

  it('maps legacy glyph icons to named icons', () => {
    expect(setup().component.icon('▧')).toBe('image');
  });

  it('filters by name and description as you type', () => {
    const { el, fixture } = setup();
    type(el.querySelector('.search input'), 'split');
    fixture.detectChanges();
    expect(cards(el).map((c) => text(c.querySelector('h3')))).toEqual(['PDF Toolkit']);
    expect(text(el.querySelector('.count'))).toBe('1 tool');

    type(el.querySelector('.search input'), 'zzz');
    fixture.detectChanges();
    expect(text(el.querySelector('.empty-preview'))).toBe('No tools match “zzz”.');
  });

  it('greets a logged-in user by first name', () => {
    expect(text(setup(true).el.querySelector('.hero .eyebrow'))).toBe('Welcome back, Maria');
  });

  it('uses a neutral label for visitors', () => {
    expect(text(setup().el.querySelector('.hero .eyebrow'))).toBe('Your everyday toolbox');
  });
});
