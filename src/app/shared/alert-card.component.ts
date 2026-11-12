import { Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { I18n } from '../core/i18n.service';
import { MedicationService } from '../core/medication.service';
import { SafetyAlert } from '../core/models';

@Component({
  selector: 'app-alert-card',
  imports: [IonIcon],
  template: `
    <article class="card alert" [class]="'sev-' + alert().severity">
      <header>
        <span class="sev-pill"><ion-icon [name]="alert().severity === 'minor' ? 'information-circle-outline' : 'warning'" />{{ t('sev.' + alert().severity) }}</span>
        <span class="kind">{{ t('safety.kind.' + alert().kind) }}</span>
      </header>
      <h3>{{ i18n.bi(alert().title) }}</h3>
      <p>{{ i18n.bi(alert().message) }}</p>
      @if (!compact()) {
        @if (names().length) {
          <div class="meds"><span>{{ t('safety.involves') }}:</span> @for (n of names(); track n) {<b>{{ n }}</b>}</div>
        }
        <div class="advice"><b>{{ t('safety.what') }}</b><p>{{ i18n.bi(alert().advice) }}</p></div>
      }
    </article>
  `,
  styles: `
    .alert { position: relative; overflow: hidden; padding: 16px 18px; padding-inline-start: 24px; }
    .alert::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 6px; background: var(--sev); }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .kind { color: var(--ms-muted); font-size: 14px; }
    h3 { margin: 0 0 6px; font-size: 19px; font-weight: 700; }
    p { margin: 0; font-size: 17px; line-height: 1.6; color: #3f4147; }
    .meds { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 15px; color: var(--ms-muted); }
    .meds b { background: #f1f2f4; color: var(--ms-text); border-radius: 999px; padding: 4px 12px; font-weight: 500; }
    .advice { margin-top: 14px; padding: 12px 14px; background: var(--sev-soft); border-radius: 14px; }
    .advice b { color: var(--sev); font-size: 15px; }
    .advice p { margin-top: 4px; font-size: 16px; color: var(--ms-text); }
  `,
})
export class AlertCardComponent {
  alert = input.required<SafetyAlert>();
  compact = input(false);
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private meds = inject(MedicationService);
  protected names = computed(() => this.alert().medIds.map((id) => this.meds.get(id)?.name).filter((n): n is string => !!n));
}
