import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';

@Component({
  selector: 'app-add',
  imports: [IonContent, IonIcon],
  template: `
    <ion-content>
      <div class="screen in-tabs">
        <h1 class="center-title">{{ t('add.title') }}</h1>
        <button type="button" class="card opt primary" (click)="go('/scan')">
          <span class="ico"><ion-icon name="camera" /></span>
          <span class="txt"><b>{{ t('add.scan') }}</b><small>{{ t('add.scan.sub') }}</small></span>
          <ion-icon class="chev" name="chevron-forward" flipRtl />
        </button>
        <button type="button" class="card opt" (click)="go('/add-med')">
          <span class="ico"><ion-icon src="assets/icons/capsule-outline.svg" /></span>
          <span class="txt"><b>{{ t('add.manual') }}</b><small>{{ t('add.manual.sub') }}</small></span>
          <ion-icon class="chev" name="chevron-forward" flipRtl />
        </button>
      </div>
    </ion-content>
  `,
  styles: `
    .opt { display: flex; align-items: center; gap: 16px; width: 100%; margin-bottom: 14px; padding: 20px 18px; border-radius: 24px; font: inherit; color: inherit; text-align: start; }
    .ico { width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; background: #eeeff1; font-size: 30px; flex: none; }
    .primary .ico { background: var(--ms-primary); color: #fff; }
    .txt { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .txt b { font-size: 19px; font-weight: 500; }
    .txt small { font-size: 15px; color: var(--ms-muted); line-height: 1.5; }
    .chev { font-size: 20px; }
  `,
})
export class AddPage {
  protected t = inject(I18n).t;
  private router = inject(Router);
  go(url: string): void {
    this.router.navigateByUrl(url);
  }
}
