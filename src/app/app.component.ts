import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  alertCircle,
  calendarOutline,
  camera,
  checkmarkCircle,
  chevronBack,
  chevronForward,
  close,
  createOutline,
  eyeOffOutline,
  eyeOutline,
  home,
  homeOutline,
  imagesOutline,
  languageOutline,
  logOutOutline,
  logoApple,
  logoGoogle,
  notificationsOutline,
  personCircleOutline,
  search,
  settings,
  settingsOutline,
  shieldCheckmark,
  timeOutline,
  trashOutline,
  warning,
  refreshOutline,
  informationCircleOutline,
  medkitOutline,
} from 'ionicons/icons';
import { I18n } from './core/i18n.service';

@Component({
  selector: 'app-root',
  template: `<ion-app [attr.dir]="i18n.dir()"><ion-router-outlet /></ion-app>`,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  protected i18n = inject(I18n);

  constructor() {
    addIcons({
      add, addCircleOutline, alertCircle, calendarOutline, camera, checkmarkCircle, chevronBack, chevronForward, close,
      createOutline, eyeOffOutline, eyeOutline, home, homeOutline, imagesOutline, languageOutline, logOutOutline, logoApple,
      logoGoogle, notificationsOutline, personCircleOutline, search, settings, settingsOutline, shieldCheckmark, timeOutline,
      trashOutline, warning, refreshOutline, informationCircleOutline, medkitOutline,
    });
  }
}
