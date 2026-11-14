import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n.service';
import { MedicationService } from '../../core/medication.service';
import { ReviewService } from '../../core/review.service';
import { SafetyService } from '../../core/safety.service';
import { AlertCardComponent } from '../../shared/alert-card.component';
import { MedIconComponent } from '../../shared/med-icon.component';
import { AlertModalComponent } from './alert-modal.component';

@Component({
  selector: 'app-home',
  imports: [IonContent, IonButton, IonIcon, RouterLink, AlertCardComponent, MedIconComponent],
  template: `
    <ion-content>
      <div class="screen in-tabs">
        <header class="head">
          <div class="avatar" aria-hidden="true">{{ initial() }}</div>
          <div>
            <div class="name">{{ hasMeds() ? t('home.hello', { name: auth.user()?.name ?? '' }) : t('home.hello', { name: auth.user()?.name ?? '' }) }}</div>
            <div class="sub" [class.alert-sub]="notify()">{{ notify() ? t('home.notif.new') : t('home.welcome') }}</div>
          </div>
        </header>

        @if (!hasMeds()) {
          <section class="empty">
            <svg viewBox="0 0 200 200" class="illus" aria-hidden="true">
              <path d="M40 40l14 18M70 18l6 22M20 70l22 6" stroke="#111" stroke-width="10" stroke-linecap="round" />
              <rect x="62" y="40" width="74" height="124" rx="14" fill="#111" />
              <rect x="70" y="52" width="58" height="100" rx="6" fill="#fff" />
              <path d="M78 130l16-24 12 14 10-10 12 20z" fill="#111" /><circle cx="108" cy="78" r="8" fill="#111" />
              <path d="M126 120c20-14 40-6 56 12l-18 34-50-4z" fill="#111" />
            </svg>
            <h1>{{ t('home.empty.title') }}</h1>
            <p>{{ t('home.empty.sub') }}</p>
            <ion-button class="btn" routerLink="/scan"><ion-icon slot="start" name="add" />{{ t('home.capture') }}</ion-button>
          </section>
        } @else {
          @if (review.due()) {
            <section class="card review">
              <h3>{{ t('home.review.title') }}</h3>
              <p>{{ t('home.review.body') }}</p>
              <ion-button class="btn" routerLink="/tabs/meds" (click)="review.markReviewed()">{{ t('home.review.btn') }}</ion-button>
            </section>
          }

          <section class="status card" [class]="'status-' + level()">
            <div class="status-head">
              <ion-icon [name]="level() === 'ok' ? 'shield-checkmark' : 'warning'" />
              <div>
                <h2>{{ level() === 'ok' ? t('home.safe.title') : t('home.risk.title') }}</h2>
                <p>{{ level() === 'ok' ? t('home.safe.body', { n: meds.active().length }) : t('home.risk.body', { n: meds.active().length }) }}</p>
              </div>
            </div>
            @if (level() !== 'ok') {
              <div class="chips">
                @for (s of sevs; track s) {
                  @if (safety.counts()[s] > 0) {
                    <span class="sev-pill" [class]="'sev-' + s">{{ safety.counts()[s] }} {{ t('sev.' + s) }}</span>
                  }
                }
              </div>
            }
          </section>

          @if (meds.active().length === 0) {
            <p class="noactive">{{ t('home.noactive') }}</p>
          }

          @for (a of top(); track a.id) {
            <app-alert-card [alert]="a" [compact]="true" class="gap" />
          }

          @if (safety.alerts().length > 0) {
            <ion-button class="btn btn-white gap" routerLink="/safety">{{ t('home.report') }}</ion-button>
          }

          @if (meds.active().length > 0) {
            <div class="row-head"><h2>{{ t('home.today') }}</h2><a routerLink="/tabs/meds" class="link">{{ t('home.seeall') }}</a></div>
            @for (m of meds.active().slice(0, 3); track m.id) {
              <div class="card mini">
                <div class="thumb"><app-med-icon [form]="m.form" [size]="34" /></div>
                <div class="mini-info"><b>{{ m.name }}</b><span>{{ m.strength ? m.strength + ' | ' : '' }}{{ i18n.doseText(m) }} | {{ i18n.freqText(m) }}</span></div>
              </div>
            }
          }

          <ion-button class="btn btn-white gap" routerLink="/scan"><ion-icon slot="start" name="camera" />{{ t('home.rescan') }}</ion-button>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; background: var(--ms-primary); color: #fff; display: grid; place-items: center; font-size: 26px; font-weight: 700; flex: none; }
    .name { font-size: 22px; font-weight: 500; }
    .sub { font-size: 17px; color: var(--ms-muted); margin-top: 2px; }
    .sub.alert-sub { color: var(--ms-primary); }
    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 36px; }
    .illus { width: 170px; margin-bottom: 26px; }
    .empty h1 { font-size: 22px; font-weight: 500; line-height: 1.6; white-space: pre-line; margin: 0 0 14px; }
    .empty p { color: var(--ms-muted); font-size: 16px; line-height: 1.7; margin: 0 8px 26px; }
    .review { background: var(--ms-primary-soft); border-color: #c7d9fb; margin-bottom: 14px; }
    .review h3 { margin: 0 0 6px; font-size: 19px; }
    .review p { margin: 0 0 14px; color: #3f4147; font-size: 16px; line-height: 1.6; }
    .status { margin-bottom: 14px; }
    .status-head { display: flex; gap: 14px; align-items: flex-start; }
    .status-head ion-icon { font-size: 34px; flex: none; margin-top: 2px; }
    .status h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
    .status p { margin: 0; font-size: 16px; color: #3f4147; line-height: 1.55; }
    .status-ok { background: var(--ms-ok-soft); border-color: #bfe3cb; }
    .status-ok ion-icon { color: var(--ms-ok); }
    .status-risk { background: #fff; }
    .status-risk ion-icon { color: var(--ms-moderate); }
    .status-major ion-icon { color: var(--ms-major); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .gap { display: block; margin-bottom: 12px; }
    .noactive { color: var(--ms-muted); font-size: 16px; line-height: 1.6; }
    .row-head { display: flex; justify-content: space-between; align-items: center; margin: 22px 0 12px; }
    .row-head h2 { margin: 0; font-size: 20px; font-weight: 500; }
    .mini { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; padding: 12px 14px; }
    .thumb { width: 56px; height: 56px; border-radius: 14px; background: #f4f4f5; display: grid; place-items: center; flex: none; }
    .mini-info { display: flex; flex-direction: column; gap: 3px; font-size: 15px; color: var(--ms-muted); }
    .mini-info b { font-size: 18px; color: var(--ms-text); }
  `,
})
export class HomePage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected auth = inject(AuthService);
  protected meds = inject(MedicationService);
  protected safety = inject(SafetyService);
  protected review = inject(ReviewService);
  private modal = inject(ModalController);
  private router = inject(Router);
  private showing = false;

  protected sevs = ['major', 'moderate', 'minor'] as const;
  protected hasMeds = computed(() => this.meds.all().length > 0);
  protected initial = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0).toUpperCase());
  protected notify = computed(() => this.safety.pendingMajor().length > 0 || this.review.due());
  protected top = computed(() => this.safety.alerts().filter((a) => a.severity !== 'minor').slice(0, 3));
  protected level = computed<'ok' | 'risk' | 'major'>(() => {
    const c = this.safety.counts();
    return c.major > 0 ? 'major' : c.moderate + c.minor > 0 ? 'risk' : 'ok';
  });

  /** Ionic lifecycle: show the conflict warning when arriving on Home with an unacknowledged serious alert. */
  async ionViewDidEnter(): Promise<void> {
    const pending = this.safety.pendingMajor();
    if (this.showing || pending.length === 0) return;
    this.showing = true;
    try {
      const m = await this.modal.create({ component: AlertModalComponent, componentProps: { alerts: pending }, cssClass: 'alert-modal', backdropDismiss: false });
      await m.present();
      const { role } = await m.onWillDismiss();
      this.safety.acknowledge(pending.map((a) => a.id));
      if (role === 'more') this.router.navigate(['/safety'], { queryParams: { focus: pending[0].id } });
    } finally {
      this.showing = false;
    }
  }
}
