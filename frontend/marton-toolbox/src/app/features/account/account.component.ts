import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';

interface License { licenseKey: string; product: string; status: string; expiresAt: string | null; }
export interface Profile {
  displayName: string; email: string; phone: string | null; address: string | null; city: string | null; county: string | null;
  postalCode: string | null; companyName: string | null; taxId: string | null; memberSince: string;
}
interface AccountData { user: { id: string; email: string; displayName: string }; license: License | null; isAdmin: boolean; profile: Profile; }
type Field = 'displayName' | 'phone' | 'address' | 'city' | 'county' | 'postalCode' | 'companyName' | 'taxId';
type Form = Record<Field, string>;

/** Fields counted for "profile complete" (company details are optional and not counted). */
const COMPLETENESS: Field[] = ['displayName', 'phone', 'address', 'city', 'county', 'postalCode'];

@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent],
  styles: [`
    .profile-head{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:6px 0 24px}
    .big-avatar{width:72px;height:72px;border-radius:22px;background:var(--gradient);color:#fff;display:grid;place-items:center;font:800 30px var(--display);box-shadow:0 14px 30px -14px rgba(79,70,229,.8)}
    .profile-head h1{margin:0 0 4px}
    .profile-head p{margin:0;color:var(--text-2);font-size:14px}
    .head-badges{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .account-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
    .account-main{display:grid;gap:20px}
    .side{display:grid;gap:20px;position:sticky;top:88px}
    .panel h3{margin-bottom:4px}
    .panel-sub{margin:0 0 18px;color:var(--text-3);font-size:13px}
    .optional{font-weight:500;color:var(--text-3);font-size:12px;margin-left:6px}
    .label-row{display:flex;align-items:baseline;gap:0}
    .readonly{background:var(--surface-2)!important;color:var(--text-3)!important}
    .progress{height:8px;border-radius:999px;background:#eceef5;overflow:hidden;margin:10px 0 8px}
    .progress span{display:block;height:100%;border-radius:inherit;background:var(--gradient);transition:width .5s var(--ease)}
    .missing{margin:6px 0 0;padding-left:18px;color:var(--text-2);font-size:13px;line-height:1.7}
    .license-key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;word-break:break-all;margin:8px 0 0}
    .links{display:grid;gap:4px}
    .links a{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;text-decoration:none;color:var(--text-2);font-size:14px;font-weight:500;--icon-size:17px}
    .links a:hover{background:var(--surface-2);color:var(--text)}
    .links mtb-icon{color:var(--brand)}
    .save-bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .save-bar .primary{margin:0}
    .saved{color:var(--success);font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:6px;--icon-size:16px}
    .logout{width:100%}
    @media(max-width:960px){.account-grid{grid-template-columns:1fr}.side{position:static}}
  `],
  template: `<section class="page">
    @if (loading()) { <div class="status-banner"><span class="spinner"></span><div><h1>Loading your account…</h1></div></div> }
    @if (loadError()) { <p class="error-text">{{ loadError() }}</p> }

    @if (account(); as a) {
      <div class="profile-head">
        <span class="big-avatar">{{ initial() }}</span>
        <div>
          <p class="eyebrow">Your account</p>
          <h1>{{ a.profile.displayName }}</h1>
          <p>{{ a.profile.email }} · Member since {{ a.profile.memberSince | date: 'MMMM y' }}</p>
          <div class="head-badges">
            <span class="status-pill" [attr.data-status]="a.license ? 'shipped' : 'pending'">{{ a.license ? 'Lifetime license' : 'No license yet' }}</span>
            @if (a.isAdmin) { <span class="status-pill" data-status="paid">Admin</span> }
          </div>
        </div>
      </div>

      <div class="account-grid">
        <form class="account-main" (submit)="save($event)">
          <div class="panel">
            <h3><mtb-icon name="shield" />Personal details</h3>
            <p class="panel-sub">How we address you and reach you about orders.</p>
            <div class="form-grid">
              <label>Full name<input autocomplete="name" [value]="form().displayName" (input)="set('displayName', $event)" required></label>
              <label><span class="label-row">Phone<span class="optional">optional</span></span><input type="tel" autocomplete="tel" placeholder="07xx xxx xxx" [value]="form().phone" (input)="set('phone', $event)"></label>
              <label class="span-2">Email<input class="readonly" [value]="a.profile.email" readonly title="Your email is your login and can't be changed here."></label>
            </div>
          </div>

          <div class="panel">
            <h3><mtb-icon name="truck" />Address</h3>
            <p class="panel-sub">Used to pre-fill the shipping form when you order from the shop.</p>
            <div class="form-grid">
              <label class="span-2"><span class="label-row">Street address<span class="optional">optional</span></span><input autocomplete="street-address" placeholder="Street, number, building, apartment" [value]="form().address" (input)="set('address', $event)"></label>
              <label><span class="label-row">City<span class="optional">optional</span></span><input autocomplete="address-level2" [value]="form().city" (input)="set('city', $event)"></label>
              <label><span class="label-row">County (județ)<span class="optional">optional</span></span><input autocomplete="address-level1" [value]="form().county" (input)="set('county', $event)"></label>
              <label><span class="label-row">Postal code<span class="optional">optional</span></span><input autocomplete="postal-code" [value]="form().postalCode" (input)="set('postalCode', $event)"></label>
            </div>
          </div>

          <div class="panel">
            <h3><mtb-icon name="card" />Company<span class="optional">optional, for invoices</span></h3>
            <p class="panel-sub">Fill this in if you buy on behalf of a company.</p>
            <div class="form-grid">
              <label>Company name<input autocomplete="organization" [value]="form().companyName" (input)="set('companyName', $event)"></label>
              <label>CUI / VAT number<input placeholder="e.g. RO12345678" [value]="form().taxId" (input)="set('taxId', $event)"></label>
            </div>
          </div>

          @if (saveError()) { <p class="error-text">{{ saveError() }}</p> }
          <div class="save-bar">
            <button class="primary" type="submit" [disabled]="saving() || !dirty() || form().displayName.trim().length < 2">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
            @if (saved() && !dirty()) { <span class="saved"><mtb-icon name="check" />Saved</span> }
            @else if (dirty()) { <span class="hint">You have unsaved changes.</span> }
          </div>
        </form>

        <div class="side">
          <div class="panel">
            <h3>Profile {{ completeness() }}% complete</h3>
            <div class="progress"><span [style.width.%]="completeness()"></span></div>
            @if (missing().length) {
              <p class="panel-sub" style="margin:0">Still missing:</p>
              <ul class="missing">@for (m of missing(); track m) { <li>{{ m }}</li> }</ul>
            } @else { <p class="panel-sub" style="margin:0">All set — checkout will be pre-filled.</p> }
          </div>

          <div class="panel">
            <h3><mtb-icon name="bolt" />License</h3>
            @if (a.license) {
              <p class="panel-sub" style="margin:0">{{ a.license.product }} · {{ a.license.status }}</p>
              <p class="license-key">{{ a.license.licenseKey }}</p>
            } @else {
              <p class="panel-sub">Unlock every tool with a one-time payment.</p>
              <a class="primary block" routerLink="/billing">Unlock all tools</a>
            }
          </div>

          <div class="panel links">
            <a routerLink="/shop/orders"><mtb-icon name="package" />My orders</a>
            <a routerLink="/shop"><mtb-icon name="bag" />Merch shop</a>
            @if (a.isAdmin) { <a routerLink="/admin"><mtb-icon name="shield" />Store admin</a> }
            <button class="secondary logout" style="margin-top:8px" (click)="logout()"><mtb-icon name="login" />Log out</button>
          </div>
        </div>
      </div>
    }
  </section>`
})
export class AccountComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  account = signal<AccountData | null>(null);
  loading = signal(true);
  loadError = signal('');
  form = signal<Form>(toForm(null));
  private savedForm = signal<Form>(toForm(null));
  saving = signal(false);
  saved = signal(false);
  saveError = signal('');

  dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.savedForm()));
  initial = computed(() => (this.form().displayName || this.account()?.profile.email || '?').trim().charAt(0).toUpperCase());
  missing = computed(() => {
    const labels: Record<string, string> = { displayName: 'Full name', phone: 'Phone', address: 'Street address', city: 'City', county: 'County', postalCode: 'Postal code' };
    return COMPLETENESS.filter(f => !this.savedForm()[f].trim()).map(f => labels[f]);
  });
  completeness = computed(() => Math.round(100 * (COMPLETENESS.length - this.missing().length) / COMPLETENESS.length));

  constructor() {
    firstValueFrom(this.http.get<{ data: AccountData }>('/api/account'))
      .then(res => { this.account.set(res.data); this.form.set(toForm(res.data.profile)); this.savedForm.set(toForm(res.data.profile)); })
      .catch(() => this.loadError.set('Could not load your account.'))
      .finally(() => this.loading.set(false));
  }

  set(field: Field, event: Event) {
    this.saved.set(false);
    this.form.update(f => ({ ...f, [field]: (event.target as HTMLInputElement).value }));
  }

  async save(event: Event) {
    event.preventDefault();
    if (this.saving() || !this.dirty()) return;
    this.saveError.set('');
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.http.put<{ data: Profile }>('/api/account/profile', this.form()));
      this.account.update(a => a && { ...a, profile: res.data });
      this.form.set(toForm(res.data));
      this.savedForm.set(toForm(res.data));
      this.auth.updateDisplayName(res.data.displayName);
      this.saved.set(true);
    } catch (err) {
      const e = err as HttpErrorResponse;
      const fieldErrors = e.error?.errors ? Object.values(e.error.errors).flat().join(' ') : '';
      this.saveError.set(e.error?.error ?? (fieldErrors || 'Could not save your profile. Please try again.'));
    } finally {
      this.saving.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}

function toForm(p: Profile | null): Form {
  return {
    displayName: p?.displayName ?? '', phone: p?.phone ?? '', address: p?.address ?? '', city: p?.city ?? '',
    county: p?.county ?? '', postalCode: p?.postalCode ?? '', companyName: p?.companyName ?? '', taxId: p?.taxId ?? ''
  };
}
