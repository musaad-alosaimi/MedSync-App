import { Component, inject, input } from '@angular/core';
import { NavController } from '@ionic/angular';
import { IonIcon } from '@ionic/angular';
import { I18n } from '../core/i18n.service';

/** Back chevron at the inline start (right in RTL, left in LTR); the icon flips with direction. */
@Component({
  selector: 'app-back',
  imports: [IonIcon],
  template: `<button type="button" class="back-btn" [attr.aria-label]="i18n.t('common.back')" (click)="go()">
    <ion-icon name="chevron-back" flipRtl />
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
