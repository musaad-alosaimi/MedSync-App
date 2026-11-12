import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon, IonToggle, ToastController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n.service';
import { MedicationService } from '../../core/medication.service';
import { Lang } from '../../core/models';
import { ProfileService } from '../../core/profile.service';
import { ReviewService } from '../../core/review.service';
import { StorageService } from '../../core/storage.service';

@Component({
  selector: 'app-settings',
  imports: [IonContent, IonToggle, IonButton, IonIcon],
  template: `
    <ion-content>
      <div class="screen in-tabs">
        <h1 class="center-title">{{ t('set.title') }}</h1>

        <section class="card acct">
          <div class="avatar" aria-hidden="true">{{ initial() }}</div>
          <div><b>{{ auth.user()?.name }}</b><small>{{ auth.user()?.email }}</small></div>
        </section>

        <h2 class="sec">{{ t('set.health') }}</h2>
        <button type="button" class="card link-row" (click)="go('/profile-setup')">
          <ion-icon name="create-outline" /><span>{{ t('set.health.edit') }}</span><small>{{ profile().age ? t('profile.yrs', { n: profile().age! }) : '' }}</small>
        </button>

        <h2 class="sec">{{ t('set.language') }}</h2>
        <div class="card seg" role="radiogroup">
          @for (l of langs; track l) {
            <button type="button" role="radio" [attr.aria-checked]="i18n.lang() === l" [class.on]="i18n.lang() === l" (click)="setLang(l)">{{ t('set.lang.' + l) }}</button>
          }
        </div>

        <h2 class="sec">{{ t('set.reminders') }}</h2>
        <div class="card toggle-row">
          <div><b>{{ t('set.reminders') }}</b><small>{{ t('set.reminders.sub') }}</small></div>
          <ion-toggle [checked]="review.remindersEnabled()" (ionChange)="setReminders($any($event).detail.checked)" [attr.aria-label]="t('set.reminders')" />
        </div>
        <div class="card review">
          <small>{{ review.lastReview() ? t('set.review.last', { date: i18n.formatDate(review.lastReview()!.slice(0, 10)) }) : t('set.review.never') }}</small>
          <ion-button class="btn btn-white" (click)="reviewNow()">{{ t('set.review.now') }}</ion-button>
        </div>

        <h2 class="sec">{{ t('set.about') }}</h2>
        <p class="about">{{ t('set.about.body') }}</p>

        <ion-button class="btn btn-white gap" (click)="logout()"><ion-icon slot="start" name="log-out-outline" />{{ t('set.logout') }}</ion-button>
        <ion-button class="btn btn-danger-text" (click)="clearAll()"><ion-icon slot="start" name="trash-outline" />{{ t('set.clear') }}</ion-button>
        <p class="ver">{{ t('set.version', { v: '0.1.0' }) }}</p>
      </div>
    </ion-content>
  `,
  styles: `
    .acct { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
    .avatar { width: 56px; height: 56px; border-radius: 50%; background: var(--ms-primary); color: #fff; display: grid; place-items: center; font-size: 24px; font-weight: 700; }
    .acct b { display: block; font-size: 19px; font-weight: 500; }
    small { color: var(--ms-muted); font-size: 15px; }
    .sec { font-size: 17px; font-weight: 500; color: var(--ms-muted); margin: 22px 4px 10px; }
    .link-row { display: flex; align-items: center; gap: 12px; width: 100%; font: inherit; font-size: 18px; color: inherit; text-align: start; min-height: 60px; }
    .link-row span { flex: 1; }
    .link-row ion-icon { font-size: 24px; }
    .seg { display: flex; gap: 6px; padding: 6px; }
    .seg button { flex: 1; min-height: 50px; border: 0; border-radius: 16px; background: transparent; font: inherit; font-size: 18px; color: var(--ms-text); }
    .seg button.on { background: var(--ms-primary); color: #fff; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .toggle-row b { display: block; font-weight: 500; font-size: 18px; margin-bottom: 4px; }
    .review { margin-top: 10px; display: flex; flex-direction: column; gap: 12px; }
    .about { color: #3f4147; font-size: 16px; line-height: 1.7; margin: 0 4px 24px; }
    .gap { margin-bottom: 10px; }
    .ver { text-align: center; color: var(--ms-muted); font-size: 14px; margin: 14px 0 0; }
  `,
})
export class SettingsPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected auth = inject(AuthService);
  protected review = inject(ReviewService);
  private profileSvc = inject(ProfileService);
  private meds = inject(MedicationService);
  private store = inject(StorageService);
  private router = inject(Router);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);

  protected profile = this.profileSvc.profile;
  protected langs: Lang[] = ['ar', 'en'];
  protected initial = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0).toUpperCase());

  go(url: string): void {
    this.router.navigateByUrl(url);
  }

  setLang(l: Lang): void {
    this.i18n.setLang(l);
    // Re-localise the scheduled native notification text.
    this.review.syncNative(this.review.remindersEnabled(), this.t('set.notif.title'), this.t('set.notif.body'));
  }

  setReminders(on: boolean): void {
    if (on === this.review.remindersEnabled()) return;
    this.review.setEnabled(on, this.t('set.notif.title'), this.t('set.notif.body'));
  }

  async reviewNow(): Promise<void> {
    this.review.markReviewed();
    (await this.toast.create({ message: this.t('set.review.done'), duration: 2000, position: 'top' })).present();
    this.router.navigateByUrl('/tabs/meds');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async clearAll(): Promise<void> {
    const a = await this.alerts.create({
      message: this.t('set.clear.confirm'),
      buttons: [
        { text: this.t('common.cancel'), role: 'cancel' },
        {
          text: this.t('common.delete'),
          role: 'destructive',
          handler: () => {
            this.meds.clear();
            this.profileSvc.reset();
            this.store.clearAll(['lang', 'onboarded', 'accounts', 'session']);
            this.router.navigateByUrl('/profile-setup', { replaceUrl: true });
          },
        },
      ],
    });
    a.present();
  }
}
