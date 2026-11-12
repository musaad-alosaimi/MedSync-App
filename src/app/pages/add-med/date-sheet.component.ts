import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { IonButton, IonDatetime, IonIcon, ModalController } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';

@Component({
  selector: 'app-date-sheet',
  imports: [IonDatetime, IonButton, IonIcon],
  template: `
    <div class="sheet-body">
      <div class="sheet-head">
        <h2>{{ t('wiz.start.pick') }}</h2>
        <button type="button" class="sheet-close" [attr.aria-label]="t('common.close')" (click)="close()"><ion-icon name="close" /></button>
      </div>
      <ion-datetime presentation="date" [firstDayOfWeek]="1" [locale]="locale()" [value]="value()" [showDefaultButtons]="false" (ionChange)="changed($any($event).detail.value)" />
      <ion-button class="btn" style="margin-top: 12px" [disabled]="!picked()" (click)="confirm()">{{ t('common.next') }}</ion-button>
    </div>
  `,
  styles: `
    ion-datetime { --background: transparent; width: 100%; max-width: 100%; font-size: 18px; }
  `,
})
export class DateSheetComponent implements OnInit {
  @Input() initial: string | null = null;
  private i18n = inject(I18n);
  protected t = this.i18n.t;
  private modalCtrl = inject(ModalController);
  protected picked = signal<string | null>(null);
  protected value = signal<string | undefined>(undefined);
  protected locale = () => (this.i18n.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US');

  ngOnInit(): void {
    const v = this.initial;
    if (v) {
      this.value.set(v);
      this.picked.set(v);
    }
  }

  changed(v: string | string[] | null | undefined): void {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) this.picked.set(s.slice(0, 10));
  }

  close(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm(): void {
    this.modalCtrl.dismiss(this.picked(), 'save');
  }
}
