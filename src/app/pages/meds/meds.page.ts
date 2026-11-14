import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonToggle } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { MedicationService } from '../../core/medication.service';
import { SafetyService } from '../../core/safety.service';
import { MedIconComponent } from '../../shared/med-icon.component';

type Filter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-meds',
  imports: [IonContent, IonToggle, MedIconComponent],
  template: `
    <ion-content>
      <div class="screen in-tabs">
        <h1 class="center-title">{{ t('meds.title') }}</h1>

        <div class="tabs" role="tablist">
          @for (f of filters; track f.id) {
            <button type="button" role="tab" [attr.aria-selected]="filter() === f.id" [class.on]="filter() === f.id" (click)="filter.set(f.id)">
              <span>{{ t('meds.' + f.id) }}</span><b>{{ counts()[f.id] }}</b>
            </button>
          }
        </div>

        @if (list().length === 0) {
          <p class="empty">{{ t('meds.empty') }}</p>
        }

        @for (m of list(); track m.id) {
          <div class="card row" (click)="edit(m.id)" (keydown.enter)="edit(m.id)" tabindex="0" role="button">
            <div class="thumb"><app-med-icon [form]="m.form" [size]="44" /></div>
            <div class="info">
              <h3>{{ m.name }}</h3>
              <div class="line">{{ m.strength ? m.strength + ' | ' : '' }}{{ i18n.doseText(m) }}</div>
              <div class="line">{{ i18n.freqText(m) }} | {{ t('meds.start') }} {{ i18n.formatDate(m.startDate) }}</div>
              @if (flagged().has(m.id)) {
                <span class="flag">{{ t('meds.alerts') }}</span>
              }
            </div>
            <ion-toggle [checked]="m.active" (click)="$event.stopPropagation()" (ionChange)="toggle(m.id, $any($event).detail.checked)" [attr.aria-label]="m.name" />
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .tabs { display: flex; gap: 6px; background: #fff; border-radius: 22px; padding: 8px; margin-bottom: 18px; border: 1px solid var(--ms-line); }
    .tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; background: transparent; border-radius: 16px; padding: 10px 6px; font: inherit; font-size: 15px; color: var(--ms-text); min-height: 52px; line-height: 1.2; }
    .tabs button b { min-width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #f1f2f4; font-weight: 500; }
    .tabs button.on { background: var(--ms-primary); color: #fff; }
    .tabs button.on b { background: #0a2a66; }
    .row { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; padding: 16px; cursor: pointer; }
    .thumb { width: 88px; height: 88px; border-radius: 20px; background: #f4f4f5; display: grid; place-items: center; flex: none; }
    .info { flex: 1; min-width: 0; }
    h3 { margin: 0 0 6px; font-size: 21px; font-weight: 500; }
    .line { font-size: 16px; color: #3f4147; line-height: 1.55; }
    .flag { display: inline-block; margin-top: 6px; background: var(--ms-moderate-soft); color: var(--ms-moderate); border-radius: 999px; padding: 2px 10px; font-size: 13px; font-weight: 700; }
    ion-toggle { flex: none; }
    .empty { text-align: center; color: var(--ms-muted); margin-top: 40px; font-size: 17px; }
  `,
})
export class MedsPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private meds = inject(MedicationService);
  private safety = inject(SafetyService);
  private router = inject(Router);

  protected filters: { id: Filter }[] = [{ id: 'all' }, { id: 'active' }, { id: 'inactive' }];
  protected filter = signal<Filter>('all');
  protected counts = computed(() => ({ all: this.meds.all().length, active: this.meds.active().length, inactive: this.meds.inactive().length }));
  protected list = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.meds.all() : f === 'active' ? this.meds.active() : this.meds.inactive();
  });
  protected flagged = computed(() => new Set(this.safety.alerts().filter((a) => a.severity !== 'minor').flatMap((a) => a.medIds)));

  toggle(id: string, active: boolean): void {
    if (this.meds.get(id)?.active !== active) this.meds.setActive(id, active);
  }

  edit(id: string): void {
    this.router.navigate(['/add-med'], { queryParams: { edit: id } });
  }
}
