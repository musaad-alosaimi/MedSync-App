import { Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bodyOutline, copyOutline, flaskOutline, flowerOutline, gitCompareOutline, heartOutline,
  helpCircleOutline, hourglassOutline, layersOutline, waterOutline,
} from 'ionicons/icons';
import { I18n } from '../core/i18n.service';
import { MedicationService } from '../core/medication.service';
import { AlertKind, SafetyAlert } from '../core/models';

const KIND_ICON: Record<AlertKind, string> = {
  duplicate: 'copy-outline',
  interaction: 'git-compare-outline',
  age: 'body-outline',
  condition: 'heart-outline',
  longterm: 'hourglass-outline',
  allergy: 'water-outline',
  polypharmacy: 'layers-outline',
  pregnancy: 'flower-outline',
  excipient: 'flask-outline',
  unverified: 'help-circle-outline',
};

@Component({
  selector: 'app-alert-card',
  imports: [IonIcon],
  template: `
    <article class="card alert" [class]="'sev-' + alert().severity">
      <header>
        <div class="kind"><ion-icon [name]="kindIcon()" />{{ t('safety.kind.' + alert().kind) }}</div>
        <span class="sev-pill"><ion-icon [name]="alert().severity === 'minor' ? 'information-circle-outline' : 'warning'" />{{ t('sev.' + alert().severity) }}</span>
      </header>
      <h3>{{ i18n.bi(alert().title) }}</h3>
      <p>{{ i18n.bi(alert().message) }}</p>
      @if (!compact()) {
        @if (names().length) {
          <div class="meds"><span>{{ t('safety.involves') }}:</span> @for (n of names(); track n) {<b>{{ n }}</b>}</div>
        }
        @if (alert().evidence) {
          <div class="evidence"><b>{{ t('safety.evidence') }}</b><p dir="ltr">{{ alert().evidence }}</p></div>
        }
      }
    </article>
  `,
  styles: `
    .alert { position: relative; overflow: hidden; padding: 16px 18px; padding-inline-start: 24px; }
    .alert::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 6px; background: var(--sev); }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .kind { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; color: var(--ms-text); }
    .kind ion-icon { flex: none; font-size: 24px; color: var(--sev); }
    h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
    p { margin: 0; font-size: 17px; line-height: 1.6; color: #3f4147; text-align: center; }
    .meds { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 15px; color: var(--ms-muted); }
    .meds b { background: #f1f2f4; color: var(--ms-text); border-radius: 999px; padding: 4px 12px; font-weight: 500; }
    .evidence { margin-top: 12px; font-size: 14px; color: var(--ms-muted); }
    .evidence p { font-size: 14px; line-height: 1.5; color: var(--ms-muted); text-align: start; }
  `,
})
export class AlertCardComponent {
  constructor() {
    addIcons({ bodyOutline, copyOutline, flaskOutline, flowerOutline, gitCompareOutline, heartOutline, helpCircleOutline, hourglassOutline, layersOutline, waterOutline });
  }

  alert = input.required<SafetyAlert>();
  compact = input(false);
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private meds = inject(MedicationService);
  protected kindIcon = computed(() => KIND_ICON[this.alert().kind] ?? 'alert-circle');
  protected names = computed(() => this.alert().medIds.map((id) => this.meds.get(id)?.name).filter((n): n is string => !!n));
}
