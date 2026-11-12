import { Component, inject, input } from '@angular/core';
import { NavController } from '@ionic/angular';
import { IonIcon } from '@ionic/angular';
import { I18n } from '../core/i18n.service';

/** Top-left back chevron (matches the design in both RTL and LTR). */
@Component({
  selector: 'app-back',
  imports: [IonIcon],
  template: `<button type="button" class="back-btn" [attr.aria-label]="i18n.t('common.back')" (click)="go()">
    <ion-icon name="chevron-back" [flipRtl]="false" />
  </button>`,
})
export class BackButtonComponent {
  fallback = input('/');
  private nav = inject(NavController);
  protected i18n = inject(I18n);
  go(): void {
    this.nav.navigateBack(this.fallback());
  }
}
