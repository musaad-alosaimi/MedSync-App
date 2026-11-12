import { Injectable, computed, inject, signal } from '@angular/core';
import { Lang, MedForm, Medication } from './models';
import { StorageService } from './storage.service';
import { AR, EN } from './translations';

const TABLES: Record<Lang, Record<string, string>> = { ar: AR, en: EN };

@Injectable({ providedIn: 'root' })
export class I18n {
  private store = inject(StorageService);
  readonly lang = signal<Lang>(this.store.get<Lang>('lang', 'ar'));
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly isRtl = computed(() => this.lang() === 'ar');

  constructor() {
    this.apply();
  }

  setLang(l: Lang): void {
    this.lang.set(l);
    this.store.set('lang', l);
    this.apply();
  }

  private apply(): void {
    const el = document.documentElement;
    el.lang = this.lang();
    el.dir = this.dir();
  }

  /** Translate a key. Reads the `lang` signal so templates re-render on language change. */
  readonly t = (key: string, params?: Record<string, string | number>): string => {
    let s = TABLES[this.lang()][key] ?? EN[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  /** Pick the current-language text from a bilingual object. */
  readonly bi = (b: { ar: string; en: string }): string => b[this.lang()];

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    const locale = this.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
  }

  formLabel(f: MedForm): string {
    return this.t('form.' + f);
  }

  freqText(m: Pick<Medication, 'everyN' | 'everyUnit'>): string {
    if (m.everyUnit === 'day' && m.everyN === 1) return this.t('freq.daily');
    if (m.everyUnit === 'week' && m.everyN === 1) return this.t('freq.weekly');
    return this.t(`freq.${m.everyUnit}s`, { n: m.everyN });
  }

  doseText(m: Pick<Medication, 'dose' | 'form'>): string {
    return `${m.dose} ${this.formLabel(m.form)}`;
  }
}
