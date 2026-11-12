import { Component, Input, inject } from '@angular/core';
import { IonButton, ModalController } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { SafetyAlert } from '../../core/models';

@Component({
  selector: 'app-alert-modal',
  imports: [IonButton],
  template: `
    <div class="wrap" role="alertdialog" aria-labelledby="am-title">
      <svg class="bottle" viewBox="0 0 120 150" aria-hidden="true">
        <rect x="30" y="8" width="60" height="24" rx="5" fill="#fff" stroke="#d4d4d8" />
        <rect x="24" y="30" width="72" height="104" rx="18" fill="#c8741f" />
        <rect x="34" y="52" width="52" height="46" rx="4" fill="#fff" />
        <ellipse cx="96" cy="136" rx="14" ry="6" fill="#f2c27a" /><ellipse cx="82" cy="140" rx="12" ry="5" fill="#f2c27a" />
      </svg>
      <p class="warn">{{ t('alert.warning') }}</p>
      <h2 id="am-title">{{ t('alert.conflict') }}</h2>
      <p class="msg">{{ i18n.bi(first.message) }}</p>
      @if (alerts.length > 1) {
        <p class="more-n">{{ t('alert.more.n', { n: alerts.length - 1 }) }}</p>
      }
      <ion-button class="btn" (click)="close('more')">{{ t('alert.more') }}</ion-button>
      <ion-button class="btn btn-white" (click)="close('ack')">{{ t('alert.consult') }}</ion-button>
    </div>
  `,
  styles: `
    .wrap { padding: 26px 22px 22px; text-align: center; display: flex; flex-direction: column; gap: 12px; }
    .bottle { width: 96px; margin: 0 auto; }
    .warn { margin: 0; font-size: 18px; color: var(--ms-muted); }
    h2 { margin: 0; color: #e10000; font-size: 28px; font-weight: 700; line-height: 1.3; }
    .msg { margin: 4px 0 8px; font-size: 18px; line-height: 1.6; }
    .more-n { margin: -6px 0 6px; color: var(--ms-muted); font-size: 15px; }
  `,
})
export class AlertModalComponent {
  @Input() alerts: SafetyAlert[] = [];
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private modalCtrl = inject(ModalController);
  protected get first(): SafetyAlert {
    return this.alerts[0];
  }

  close(role: 'more' | 'ack'): void {
    this.modalCtrl.dismiss(null, role);
  }
}
