import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { money } from '../../core/shop/cart.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface AiStatus {
  available: boolean;
  model: string;
  problem: string | null;
}

/** The user's allowance over a rolling 24 hours (see AiQuotaRules on the server). Shown only as a percentage. */
export interface AiQuota {
  percentUsed: number;
  limitReached: boolean;
  plan: string;
  planName: string;
  planExpiresAt: string | null;
  /** When the oldest counted use frees up; once the limit is reached, when chatting is allowed again. */
  nextFreeAt: string | null;
}
export interface AiPack {
  id: string;
  name: string;
  /** How many times the Basic allowance the pack gives per 24 hours. */
  timesBasic: number;
  days: number;
  price: number;
  currency: string;
}
export interface AiUsage {
  quota: AiQuota;
  packs: AiPack[];
}
interface PackOrder {
  status: 'Paid' | 'Pending' | 'Failed';
  packName: string;
  quota: AiQuota;
}
export interface PackNotice {
  kind: 'ok' | 'pending' | 'failed';
  text: string;
}

const CLOCK_TICK_MS = 15_000;
export const PACK_POLL_MS = 3000;
const PACK_POLL_ATTEMPTS = 10;

/** Same limits as AiController on the server. */
export const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 32000;
const MAX_MESSAGES = 40;
const STORAGE_KEY = 'mtb_ai_chat';

/** Keys of the example prompts (shown and sent in the user's language). */
export const SUGGESTIONS = ['ai.s1', 'ai.s2', 'ai.s3', 'ai.s4'];

@Component({
  standalone: true,
  imports: [IconComponent, ...I18N],
  templateUrl: './ai-assistant.component.html',
  styleUrl: './ai-assistant.component.scss',
})
export class AiAssistantComponent implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  i18n = inject(I18nService);
  private router = inject(Router);
  private thread = viewChild<ElementRef<HTMLElement>>('thread');
  private input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private route = inject(ActivatedRoute);
  private abort?: AbortController;
  private clock?: ReturnType<typeof setInterval>;
  private packTimer?: ReturnType<typeof setTimeout>;
  private refreshingUsage = false;

  readonly maxChars = MAX_MESSAGE_CHARS;
  readonly suggestions = SUGGESTIONS;
  status = signal<AiStatus | null>(null);
  messages = signal<ChatTurn[]>(loadChat());
  draft = signal('');
  streaming = signal(false);
  error = signal('');

  readonly money = money;
  usage = signal<AiUsage | null>(null);
  /** Ticks so the countdowns stay live. */
  now = signal(Date.now());
  showPacks = signal(false);
  buying = signal<string | null>(null);
  packNotice = signal<PackNotice | null>(null);
  /** The order still waiting for PayU after polling gave up, for the "Check again" button. */
  pendingOrder = signal<string | null>(null);

  quota = computed(() => this.usage()?.quota ?? null);
  limitReached = computed(() => !!this.quota()?.limitReached);
  percent = computed(() => Math.min(100, Math.max(0, this.quota()?.percentUsed ?? 0)));
  level = computed<'ok' | 'warn' | 'full'>(() => (this.limitReached() ? 'full' : this.percent() >= 80 ? 'warn' : 'ok'));
  /** "2 h 5 min" until some of the allowance frees up. */
  nextFreeIn = computed(() => {
    const at = this.quota()?.nextFreeAt;
    return at ? duration(new Date(at).getTime() - this.now(), this.i18n) : '';
  });
  planUntil = computed(() => {
    const at = this.quota()?.planExpiresAt;
    return at ? formatDate(at, this.i18n.locale()) : '';
  });

  constructor() {
    this.checkStatus();
    this.loadUsage();
    setTimeout(() => this.scrollDown());
    this.clock = setInterval(() => this.tick(), CLOCK_TICK_MS);
    // Back from PayU after buying a pack.
    const order = this.route.snapshot.queryParamMap.get('aiOrder');
    if (order) this.confirmPack(order, 0);
  }

  ngOnDestroy() {
    this.abort?.abort();
    clearInterval(this.clock);
    clearTimeout(this.packTimer);
  }

  async loadUsage() {
    try {
      const res = await firstValueFrom(this.http.get<{ data: AiUsage }>('/api/ai/usage'));
      this.usage.set(res.data);
    } catch {
      // The chat still works without the meter; the server enforces the limit anyway.
    }
  }

  /** Moves the countdowns on, and re-reads the allowance once a message has freed up. */
  tick() {
    this.now.set(Date.now());
    const at = this.quota()?.nextFreeAt;
    if (at && new Date(at).getTime() <= this.now() && !this.refreshingUsage && !this.streaming()) {
      this.refreshingUsage = true;
      this.loadUsage().finally(() => (this.refreshingUsage = false));
    }
  }

  togglePacks() {
    this.showPacks.update((v) => !v);
  }

  async buy(pack: AiPack) {
    if (this.buying()) return;
    this.buying.set(pack.id);
    this.packNotice.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: { checkoutUrl: string } }>(`/api/ai/packs/${encodeURIComponent(pack.id)}/checkout`, {}),
      );
      this.leaveFor(res.data.checkoutUrl);
    } catch (err) {
      const message = this.i18n.server(err instanceof HttpErrorResponse ? err.error?.error : null, 'ai.pay_failed');
      this.packNotice.set({ kind: 'failed', text: message });
      this.buying.set(null);
    }
  }

  /** Goes to the payment page (a separate method so tests can stop the real navigation). */
  leaveFor(url: string) {
    window.location.assign(url);
  }

  async confirmPack(orderId: string, attempt: number) {
    clearTimeout(this.packTimer);
    if (attempt === 0) this.packNotice.set({ kind: 'pending', text: this.i18n.t('ai.confirming') });
    try {
      const res = await firstValueFrom(this.http.post<{ data: PackOrder }>(`/api/ai/packs/orders/${orderId}/confirm`, {}));
      const order = res.data;
      this.usage.update((u) => (u ? { ...u, quota: order.quota } : u));
      if (order.status === 'Paid') {
        const q = order.quota;
        this.packNotice.set({
          kind: 'ok',
          text: q.planExpiresAt
            ? this.i18n.t('ai.pack_active_until', {
                pack: order.packName,
                date: formatDate(q.planExpiresAt, this.i18n.locale()),
                n: q.percentUsed,
              })
            : this.i18n.t('ai.pack_active', { pack: order.packName, n: q.percentUsed }),
        });
        this.forgetOrder();
        return;
      }
      if (order.status === 'Failed') {
        this.packNotice.set({ kind: 'failed', text: this.i18n.t('ai.pack_failed') });
        this.forgetOrder();
        return;
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.packNotice.set(null);
        this.forgetOrder();
        return;
      }
      // Keep polling; a passing error shouldn't fail the check.
    }
    if (attempt + 1 >= PACK_POLL_ATTEMPTS) {
      this.packNotice.set({ kind: 'pending', text: this.i18n.t('ai.pack_pending') });
      this.pendingOrder.set(orderId);
      return;
    }
    this.packTimer = setTimeout(() => this.confirmPack(orderId, attempt + 1), PACK_POLL_MS);
  }

  checkPackAgain() {
    const order = this.pendingOrder();
    if (order) this.confirmPack(order, 0);
  }

  private forgetOrder() {
    this.pendingOrder.set(null);
    if (this.route.snapshot.queryParamMap.has('aiOrder')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { aiOrder: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  async checkStatus() {
    try {
      const res = await firstValueFrom(this.http.get<{ data: AiStatus }>('/api/ai/status'));
      this.status.set(res.data);
    } catch {
      this.status.set({ available: false, model: '', problem: this.i18n.t('ai.unreachable') });
    }
  }

  useSuggestion(text: string) {
    this.draft.set(text);
    this.input()?.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent) {
    // Enter sends, Shift+Enter adds a new line (IME composition must not send).
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  newChat() {
    this.stop();
    this.messages.set([]);
    this.error.set('');
    saveChat([]);
    this.input()?.nativeElement.focus();
  }

  stop() {
    this.abort?.abort();
  }

  async send() {
    const text = this.draft().trim();
    if (!text || this.streaming()) return;
    if (this.limitReached()) {
      this.showPacks.set(true);
      return;
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      this.error.set(this.i18n.t('ai.too_long', { max: MAX_MESSAGE_CHARS.toLocaleString(this.i18n.locale()) }));
      return;
    }
    const history = trimHistory([...this.messages(), { role: 'user', content: text }]);
    this.error.set('');
    this.draft.set('');
    this.messages.set([...history, { role: 'assistant', content: '' }]);
    this.streaming.set(true);
    this.scrollDown();

    const abort = (this.abort = new AbortController());
    let received = false;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.auth.token() ? { Authorization: `Bearer ${this.auth.token()}` } : {}) },
        body: JSON.stringify({ messages: history }),
        signal: abort.signal,
      });
      if (!res.ok) throw await chatError(res, this.i18n);
      if (!res.body) throw new ChatError(0, this.i18n.t('ai.unreadable'));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        if (!piece) continue;
        received = true;
        this.appendToReply(piece);
      }
      this.appendToReply(decoder.decode());
    } catch (err) {
      if (abort.signal.aborted) {
        // Stopped by the user: keep whatever arrived.
      } else if (err instanceof ChatError && err.status === 401) {
        this.auth.logout();
        this.router.navigate(['/login'], { queryParams: { expired: '1' } });
        return;
      } else {
        this.error.set(err instanceof ChatError ? err.message : this.i18n.t('ai.no_reach'));
        if (err instanceof ChatError && err.status === 503) this.checkStatus();
        if (err instanceof ChatError && err.quota) {
          // Limit reached: show the real numbers and the packs.
          const quota = err.quota;
          this.usage.update((u) => (u ? { ...u, quota } : u));
          this.showPacks.set(true);
        }
      }
      if (!received) {
        // Nothing came back: drop the empty reply and give the user their message back to retry.
        this.messages.set(history.slice(0, -1));
        if (!abort.signal.aborted) this.draft.set(text);
      }
    } finally {
      if (this.abort === abort) this.abort = undefined;
      this.streaming.set(false);
      saveChat(this.messages());
      this.scrollDown();
      // The server counts the reply's real tokens once it ends (also from other tabs and devices).
      if (received) this.loadUsage();
    }
  }

  private appendToReply(piece: string) {
    if (!piece) return;
    this.messages.update((list) => {
      const last = list[list.length - 1];
      return [...list.slice(0, -1), { ...last, content: last.content + piece }];
    });
    this.scrollDown();
  }

  private scrollDown() {
    const el = this.thread()?.nativeElement;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }
}

class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Sent with a 429 when the daily limit is reached. */
    readonly quota?: AiQuota,
  ) {
    super(message);
  }
}

async function chatError(res: Response, i18n: I18nService): Promise<ChatError> {
  if (res.status === 402) return new ChatError(402, i18n.t('common.license_required'));
  try {
    const body = await res.json();
    if (body?.error) return new ChatError(res.status, i18n.server(body.error), body.code === 'ai_limit' ? body.quota : undefined);
  } catch {
    /* not JSON */
  }
  return new ChatError(res.status, i18n.t(res.status === 503 ? 'ai.unavailable' : 'ai.failed'));
}

/** 7 230 000 ms -> "2 h 1 min"; under a minute reads "less than a minute" (in the user's language with i18n). */
export function duration(ms: number, i18n?: Pick<I18nService, 't'>): string {
  const t = (key: string, fallback: string, params: Record<string, number> = {}) => (i18n ? i18n.t(key, params) : fallback);
  if (ms < 60_000) return t('ai.dur_lt_min', 'less than a minute');
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return t('ai.dur_hm', `${h} h ${m} min`, { h, m });
  return h ? t('ai.dur_h', `${h} h`, { h }) : t('ai.dur_m', `${m} min`, { m });
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Keeps the newest turns within the server's limits; the oldest are dropped first. */
export function trimHistory(list: ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let total = 0;
  for (let i = list.length - 1; i >= 0 && kept.length < MAX_MESSAGES; i--) {
    total += list[i].content.length;
    if (total > MAX_TOTAL_CHARS && kept.length) break;
    if (list[i].content.trim()) kept.unshift(list[i]);
  }
  // The server expects the conversation to start cleanly; an orphaned assistant turn first is harmless but pointless.
  while (kept.length > 1 && kept[0].role === 'assistant') kept.shift();
  return kept;
}

/** The conversation survives navigating between tools (per browser tab), not closing the tab. */
function loadChat(): ChatTurn[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string') : [];
  } catch {
    return [];
  }
}
function saveChat(list: ChatTurn[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((m) => m.content.trim())));
  } catch {
    /* storage full or blocked */
  }
}
