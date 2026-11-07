import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../core/ui/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { I18N } from '../../core/i18n/translate.pipe';

interface License {
  licenseKey: string;
  product: string;
  status: string;
  expiresAt: string | null;
}
export interface Profile {
  displayName: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  companyName: string | null;
  taxId: string | null;
  memberSince: string;
}
interface AccountData {
  user: { id: string; email: string; displayName: string };
  license: License | null;
  isAdmin: boolean;
  profile: Profile;
}
type Field = 'displayName' | 'phone' | 'address' | 'city' | 'county' | 'postalCode' | 'companyName' | 'taxId';
type Form = Record<Field, string>;

/** Fields counted for "profile complete" (company details are optional and not counted). */
const COMPLETENESS: Field[] = ['displayName', 'phone', 'address', 'city', 'county', 'postalCode'];

@Component({
  standalone: true,
  imports: [RouterLink, IconComponent, ...I18N],
  styleUrl: './account.component.scss',
  templateUrl: './account.component.html',
})
export class AccountComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  i18n = inject(I18nService);
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
    const labels: Record<string, string> = {
      displayName: 'cart.full_name',
      phone: 'cart.phone',
      address: 'cart.street',
      city: 'cart.city',
      county: 'acct.county',
      postalCode: 'cart.postal_code',
    };
    return COMPLETENESS.filter((f) => !this.savedForm()[f].trim()).map((f) => this.i18n.t(labels[f]));
  });
  completeness = computed(() => Math.round((100 * (COMPLETENESS.length - this.missing().length)) / COMPLETENESS.length));

  constructor() {
    firstValueFrom(this.http.get<{ data: AccountData }>('/api/account'))
      .then((res) => {
        this.account.set(res.data);
        this.form.set(toForm(res.data.profile));
        this.savedForm.set(toForm(res.data.profile));
      })
      .catch(() => this.loadError.set(this.i18n.t('acct.load_failed')))
      .finally(() => this.loading.set(false));
  }

  set(field: Field, event: Event) {
    this.saved.set(false);
    this.form.update((f) => ({ ...f, [field]: (event.target as HTMLInputElement).value }));
  }

  async save(event: Event) {
    event.preventDefault();
    if (this.saving() || !this.dirty()) return;
    this.saveError.set('');
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.http.put<{ data: Profile }>('/api/account/profile', this.form()));
      this.account.update((a) => a && { ...a, profile: res.data });
      this.form.set(toForm(res.data));
      this.savedForm.set(toForm(res.data));
      this.auth.updateDisplayName(res.data.displayName);
      this.saved.set(true);
    } catch (err) {
      const e = err as HttpErrorResponse;
      const fieldErrors = e.error?.errors ? Object.values(e.error.errors).flat().join(' ') : '';
      this.saveError.set(e.error?.error ? this.i18n.server(e.error.error) : fieldErrors || this.i18n.t('acct.save_failed'));
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
    displayName: p?.displayName ?? '',
    phone: p?.phone ?? '',
    address: p?.address ?? '',
    city: p?.city ?? '',
    county: p?.county ?? '',
    postalCode: p?.postalCode ?? '',
    companyName: p?.companyName ?? '',
    taxId: p?.taxId ?? '',
  };
}
