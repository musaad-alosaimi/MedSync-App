import { Component, inject } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home">
          <ion-icon class="off" name="home-outline" /><ion-icon class="on" name="home" />
          <ion-label>{{ t('nav.home') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="meds">
          <ion-icon class="off" src="assets/icons/capsule-outline.svg" /><ion-icon class="on" src="assets/icons/capsule.svg" />
          <ion-label>{{ t('nav.meds') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="add">
          <ion-icon class="off" name="add-circle-outline" /><ion-icon class="on" name="add-circle-outline" />
          <ion-label>{{ t('nav.add') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings">
          <ion-icon class="off" name="settings-outline" /><ion-icon class="on" name="settings" />
          <ion-label>{{ t('nav.settings') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
  styles: `
    ion-tab-button .on { display: none; }
    ion-tab-button.tab-selected .on { display: block; }
    ion-tab-button.tab-selected .off { display: none; }
    ion-tab-button.tab-selected ion-label { font-weight: 700; }
  `,
})
export class TabsPage {
  protected t = inject(I18n).t;
}
