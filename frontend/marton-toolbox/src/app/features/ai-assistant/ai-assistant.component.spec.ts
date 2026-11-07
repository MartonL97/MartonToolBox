import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AiAssistantComponent, AiQuota, AiUsage, duration, trimHistory } from './ai-assistant.component';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, click, flushAll, render, renderAt, settle, text, type } from '../../../testing/test-helpers';

const HOUR = 3_600_000;
const quota = (over: Partial<AiQuota> = {}): AiQuota => ({
  percentUsed: 40,
  limitReached: false,
  plan: 'basic',
  planName: 'Basic',
  planExpiresAt: null,
  nextFreeAt: new Date(Date.now() + 2 * HOUR + 5 * 60_000 - 1000).toISOString(),
  ...over,
});
const usage = (q: AiQuota = quota()): AiUsage => ({
  quota: q,
  packs: [
    { id: 'plus', name: 'Plus', timesBasic: 5, days: 30, price: 19, currency: 'RON' },
    { id: 'pro', name: 'Pro', timesBasic: 20, days: 30, price: 49, currency: 'RON' },
  ],
});
const FULL = quota({ percentUsed: 100, limitReached: true });
const PLUS = quota({ plan: 'plus', planName: 'Plus', percentUsed: 8, planExpiresAt: '2026-12-07T12:00:00Z' });

/** A fetch Response whose body arrives in the given pieces, like a streamed reply. */
function streamed(pieces: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((p) => controller.enqueue(encoder.encode(p)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
const jsonError = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

describe('AiAssistantComponent', () => {
  let fetchSpy: jasmine.Spy;

  async function setup(status = { available: true, model: 'qwen3-4b', problem: null as string | null }, meter: AiUsage = usage()) {
    fetchSpy = spyOn(window, 'fetch');
    const r = render(AiAssistantComponent, { user: TEST_USER });
    flushAll(r.http, '/api/account', { data: { isAdmin: false } });
    r.http.expectOne('/api/ai/status').flush({ data: status });
    r.http.expectOne('/api/ai/usage').flush({ data: meter });
    await settle(r.fixture);
    return r;
  }

  async function sendMessage(r: Awaited<ReturnType<typeof setup>>, message: string) {
    type(r.el.querySelector('textarea'), message);
    r.fixture.detectChanges();
    click(r.el.querySelector('.composer .primary'));
    await settle(r.fixture, 6);
  }

  const bubbles = (el: HTMLElement) => Array.from(el.querySelectorAll('.turn')).map((t) => [t.classList.contains('user') ? 'user' : 'assistant', text(t.querySelector('.bubble'))]);

  it('shows suggestions for an empty chat and fills the box when one is picked', async () => {
    const { el, fixture } = await setup();
    expect(text(el.querySelector('.chat-empty h2'))).toBe('How can I help?');
    click(el.querySelector('.suggestion'));
    fixture.detectChanges();
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toContain('overdue invoice');
  });

  it('streams the reply into the conversation, sending the token and history', async () => {
    const r = await setup();
    fetchSpy.and.resolveTo(streamed(['Hel', 'lo! How', ' can I help?']));
    await sendMessage(r, 'Hi there');

    expect(bubbles(r.el)).toEqual([
      ['user', 'Hi there'],
      ['assistant', 'Hello! How can I help?'],
    ]);
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe('/api/ai/chat');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ role: 'user', content: 'Hi there' }] });
    expect((r.el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    expect(text(r.el.querySelector('.hint'))).toContain('Model: qwen3-4b');
  });

  it('sends Enter but not Shift+Enter', async () => {
    const { component } = await setup();
    fetchSpy.and.resolveTo(streamed(['ok']));
    component.draft.set('Hello');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(fetchSpy).not.toHaveBeenCalled();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('gives the message back and shows the reason when the model is down', async () => {
    const r = await setup();
    fetchSpy.and.resolveTo(jsonError(503, "The AI model isn't running. Start it with: docker compose up -d llm"));
    await sendMessage(r, 'Are you there?');
    r.http.expectOne('/api/ai/status').flush({ data: { available: false, model: 'qwen3-4b', problem: "The AI model isn't running." } });
    await settle(r.fixture);

    expect(bubbles(r.el)).toEqual([]);
    expect(text(r.el.querySelector('.chat-error'))).toContain("isn't running");
    expect((r.el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Are you there?');
    expect(text(r.el.querySelector('.ai-unavailable'))).toContain('The AI model is offline.');
  });

  it('logs out and goes to login when the session expired', async () => {
    const r = await setup();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fetchSpy.and.resolveTo(new Response(null, { status: 401 }));
    await sendMessage(r, 'Hello');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: '1' } });
  });

  it('warns while the model is still starting', async () => {
    const { el } = await setup({ available: false, model: 'qwen3-4b', problem: 'The AI model is still starting (the first start downloads it). Try again in a minute.' });
    expect(text(el.querySelector('.ai-unavailable'))).toContain('still starting');
  });

  it('starts a new chat', async () => {
    const r = await setup();
    fetchSpy.and.resolveTo(streamed(['Sure.']));
    await sendMessage(r, 'Help me');
    click(r.el.querySelector('.new-chat'));
    r.fixture.detectChanges();
    expect(bubbles(r.el)).toEqual([]);
    expect(sessionStorage.getItem('mtb_ai_chat')).toBe('[]');
  });

  describe('daily limit', () => {
    const bar = (el: HTMLElement) => el.querySelector('.usage-bar') as HTMLElement;

    it('shows the pack and the usage as a percentage, never as counts', async () => {
      const { el } = await setup();
      expect(text(el.querySelector('.plan-badge'))).toBe('Basic pack');
      expect(text(el.querySelector('.usage-count'))).toBe('40% used in the last 24 hours');
      expect(bar(el).getAttribute('aria-valuenow')).toBe('40');
      expect(bar(el).getAttribute('aria-valuemax')).toBe('100');
      expect((bar(el).querySelector('span') as HTMLElement).style.width).toBe('40%');
      expect(text(el.querySelector('.usage-note'))).toBe('60% left. Longer messages and replies use more.');
      expect(text(el.querySelector('.ai-usage'))).not.toMatch(/message(s)? left|token/i);
      expect(el.querySelector('.ai-usage')!.classList).not.toContain('warn');
    });

    it('updates the bar from the server after each reply', async () => {
      const r = await setup();
      fetchSpy.and.resolveTo(streamed(['Hi!']));
      await sendMessage(r, 'Hello');

      r.http.expectOne('/api/ai/usage').flush({ data: usage(quota({ percentUsed: 85 })) });
      await settle(r.fixture);
      expect(text(r.el.querySelector('.usage-count strong'))).toBe('85%');
      expect(r.el.querySelector('.ai-usage')!.classList).toContain('warn');
      expect(text(r.el.querySelector('.usage-note'))).toBe('15% left. Longer messages and replies use more. Some frees up in 2 h 5 min.');
    });

    it('blocks sending when the limit is reached and offers the packs', async () => {
      const r = await setup(undefined, usage(FULL));
      expect(r.el.querySelector('.ai-usage')!.classList).toContain('full');
      expect(text(r.el.querySelector('.usage-note'))).toContain('Limit reached. You can chat again in 2 h 5 min');
      type(r.el.querySelector('textarea'), 'One more?');
      r.fixture.detectChanges();
      expect((r.el.querySelector('.composer .primary') as HTMLButtonElement).disabled).toBeTrue();
      expect(r.el.querySelector('textarea')!.getAttribute('placeholder')).toContain('limit reached');

      r.component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      r.fixture.detectChanges();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(r.el.querySelectorAll('.pack').length).toBe(2);
    });

    it('starts the payment for a pack', async () => {
      const r = await setup();
      const leave = spyOn(r.component, 'leaveFor');
      click(r.el.querySelector('.more-packs'));
      r.fixture.detectChanges();
      const buttons = r.el.querySelectorAll('.pack-buy');
      expect(text(buttons[0])).toBe('Buy · 19,00 RON');
      expect(text(r.el.querySelector('.pack-limit'))).toBe('5× the Basic allowance');
      click(buttons[1]);
      r.fixture.detectChanges();
      expect(text(r.el.querySelectorAll('.pack-buy')[1])).toBe('Opening payment…');

      const req = r.http.expectOne('/api/ai/packs/pro/checkout');
      expect(req.request.method).toBe('POST');
      req.flush({ data: { orderId: 'o-1', checkoutUrl: 'https://payu.test/pay', amount: 49, currency: 'RON' } });
      await settle(r.fixture);
      expect(leave).toHaveBeenCalledWith('https://payu.test/pay');
    });

    it('offers to extend the pack the user already has', async () => {
      const r = await setup(undefined, usage(PLUS));
      click(r.el.querySelector('.more-packs'));
      r.fixture.detectChanges();
      expect(text(r.el.querySelector('.pack.current .pack-buy'))).toBe('Add 30 days · 19,00 RON');
      expect(text(r.el.querySelector('.plan-until'))).toBe('Plus until 7 Dec 2026.');
    });

    it('shows the packs when the server refuses a message over the limit', async () => {
      const r = await setup();
      fetchSpy.and.resolveTo(
        new Response(JSON.stringify({ error: "You've used 100% of your Basic pack's AI allowance for the last 24 hours.", code: 'ai_limit', quota: FULL }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await sendMessage(r, 'Hello');
      expect(text(r.el.querySelector('.chat-error'))).toContain("You've used 100%");
      expect(text(r.el.querySelector('.usage-count strong'))).toBe('100%');
      expect(r.el.querySelectorAll('.pack').length).toBe(2);
      expect((r.el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Hello');
    });

    it('confirms a bought pack after returning from the payment page', async () => {
      const r = await renderAt(AiAssistantComponent, 'tools/ai-assistant', '/tools/ai-assistant?aiOrder=o-1', { user: TEST_USER });
      flushAll(r.http, '/api/account', { data: { isAdmin: false } });
      r.http.expectOne('/api/ai/status').flush({ data: { available: true, model: 'qwen3-4b', problem: null } });
      r.http.expectOne('/api/ai/usage').flush({ data: usage() });
      const confirm = r.http.expectOne('/api/ai/packs/orders/o-1/confirm');
      confirm.flush({ data: { status: 'Paid', packName: 'Plus', quota: PLUS } });
      await settle(r.harness);

      expect(text(r.harness.routeNativeElement!.querySelector('.pack-notice'))).toBe("Your Plus pack is active until 7 Dec 2026. You're now at 8% of your allowance.");
      expect(text(r.harness.routeNativeElement!.querySelector('.plan-badge'))).toBe('Plus pack');
      expect(TestBed.inject(Router).url).toBe('/tools/ai-assistant');
    });

    it('formats the time until a message frees up', () => {
      expect(duration(20_000)).toBe('less than a minute');
      expect(duration(61_000)).toBe('2 min');
      expect(duration(HOUR)).toBe('1 h');
      expect(duration(2 * HOUR + 5 * 60_000)).toBe('2 h 5 min');
    });
  });

  it('keeps only the newest turns within the server limits', () => {
    const long = 'x'.repeat(7000);
    const list = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: long + i }));
    const kept = trimHistory(list);
    expect(kept.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(32000);
    expect(kept[kept.length - 1].content).toBe(long + 9);
    expect(kept[0].role).toBe('user');
  });
});
