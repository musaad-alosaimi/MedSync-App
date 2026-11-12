import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { StorageService } from '../../core/storage.service';

@Component({
  selector: 'app-onboarding',
  imports: [IonContent, IonButton, IonIcon],
  template: `
    <ion-content [scrollY]="false">
      <div class="screen onb" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
        @if (index() > 0) {
          <button type="button" class="back-btn" [attr.aria-label]="t('common.back')" (click)="prev()"><ion-icon name="chevron-back" [flipRtl]="false" /></button>
        }
        <button type="button" class="skip" (click)="finish()">{{ t('common.skip') }}</button>

        <div class="visual" aria-hidden="true">
          @switch (index()) {
            @case (0) {
              <div class="phone">
                <div class="shelf">
                  @for (n of [1, 2, 3, 4, 5, 6]; track n) {
                    <div class="box" [style.--h.deg]="n * 47"><span class="detect"></span></div>
                  }
                </div>
              </div>
              <div class="float cam"><ion-icon name="camera" /></div>
            }
            @case (1) {
              <div class="phone">
                <div class="mini-head">
                  <span class="mini-chip on">21 {{ t('meds.all') }}</span>
                  <span class="mini-chip">15 {{ t('meds.active') }}</span>
                </div>
                <div class="mini-card"><b>Metformin</b><span class="mini-tag">{{ t('alert.warning') }}</span></div>
              </div>
              <div class="float med-card">
                <span class="med-tag">{{ t('alert.warning') }}</span>
                <div class="pill-img"></div>
                <div class="med-info">
                  <b>Metformin</b>
                  <span>1 {{ t('form.capsule') }}</span>
                  <span class="med-btn">{{ t('alert.more') }}</span>
                </div>
              </div>
            }
            @default {
              <div class="stack">
                <div class="sev-row sev-major"><span class="dot"></span>{{ t('sev.major') }}</div>
                <div class="sev-row sev-moderate"><span class="dot"></span>{{ t('sev.moderate') }}</div>
                <div class="sev-row sev-minor"><span class="dot"></span>{{ t('sev.minor') }}</div>
              </div>
              <div class="float cam"><ion-icon name="notifications-outline" /></div>
            }
          }
        </div>

        <div class="dots" role="tablist">
          @for (n of [0, 1, 2]; track n) {
            <span class="dot-i" [class.on]="n === index()"></span>
          }
        </div>

        <h1 class="onb-title">{{ t('onb.' + (index() + 1) + '.title') }}</h1>
        <p class="onb-body">{{ t('onb.' + (index() + 1) + '.body') }}</p>

        <div class="grow"></div>
        <ion-button class="btn" (click)="next()">{{ index() === 2 ? t('onb.start') : t('common.next') }}</ion-button>
      </div>
    </ion-content>
  `,
  styles: `
    .onb { padding-top: calc(var(--ion-safe-area-top, 0px) + 60px); }
    .skip { position: absolute; top: calc(var(--ion-safe-area-top, 0px) + 14px); right: 20px; border: 0; background: none; font-size: 18px; color: var(--ms-text); padding: 6px; }
    .visual { position: relative; height: 380px; display: grid; place-items: start center; margin-bottom: 8px; }
    .phone { width: 250px; height: 330px; border: 8px solid #111; border-bottom: 0; border-radius: 36px 36px 0 0; background: #fff; padding: 22px 14px; overflow: hidden; }
    .shelf { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-top: 18px; }
    .box { height: 62px; border-radius: 6px; background: hsl(var(--h), 55%, 90%); border: 1px solid hsl(var(--h), 40%, 75%); position: relative; }
    .detect { position: absolute; inset: -3px; border: 2.5px solid #1aa31a; border-radius: 4px; }
    .float { position: absolute; }
    .cam { inset-inline-end: 10px; bottom: 36px; width: 64px; height: 64px; border-radius: 50%; background: var(--ms-primary); color: #fff; display: grid; place-items: center; font-size: 30px; box-shadow: 0 10px 24px rgba(0, 87, 229, 0.35); }
    .mini-head { display: flex; gap: 8px; margin-bottom: 12px; font-size: 11px; }
    .mini-chip { padding: 6px 8px; border-radius: 8px; background: #f1f2f4; }
    .mini-chip.on { background: var(--ms-primary); color: #fff; }
    .mini-card { border: 1px solid var(--ms-line); border-radius: 14px; padding: 14px; display: flex; justify-content: space-between; font-size: 13px; }
    .mini-tag, .med-tag { background: #e10000; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 0 0 8px 8px; }
    .med-card { bottom: 0; width: 330px; background: #fff; border-radius: 20px; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.14); padding: 22px 16px 16px; display: flex; gap: 16px; align-items: center; }
    .med-tag { position: absolute; top: 0; inset-inline-end: 0; border-radius: 0 20px 0 12px; font-size: 13px; padding: 5px 12px; }
    .pill-img { width: 92px; height: 92px; border-radius: 16px; background: #f4f4f5 radial-gradient(circle at 50% 55%, #c2681d 0 34%, transparent 35%); flex: none; }
    .med-info { display: flex; flex-direction: column; gap: 4px; flex: 1; font-size: 15px; }
    .med-btn { margin-top: 6px; background: var(--ms-primary); color: #fff; text-align: center; padding: 8px; border-radius: 14px; font-size: 14px; }
    .stack { width: 300px; padding-top: 24px; display: flex; flex-direction: column; gap: 14px; }
    .sev-row { display: flex; align-items: center; gap: 12px; padding: 20px; border-radius: 20px; background: var(--sev-soft); color: var(--sev); font-size: 19px; font-weight: 700; }
    .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--sev); }
    .dots { display: flex; justify-content: center; gap: 8px; margin: 12px 0 28px; }
    .dot-i { width: 24px; height: 12px; border-radius: 8px; background: #d4d4d8; transition: all 0.2s; }
    .dot-i.on { background: var(--ms-primary); width: 36px; }
    .onb-title { font-size: 26px; font-weight: 700; text-align: center; margin: 0 0 14px; line-height: 1.35; }
    .onb-body { font-size: 18px; color: #3f4147; text-align: center; margin: 0; line-height: 1.7; }
    .grow { flex: 1; min-height: 20px; }
  `,
})
export class OnboardingPage {
  protected t = inject(I18n).t;
  private i18n = inject(I18n);
  private router = inject(Router);
  private store = inject(StorageService);
  protected index = signal(0);
  private x0 = 0;

  next(): void {
    if (this.index() < 2) this.index.update((i) => i + 1);
    else this.finish();
  }

  prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  finish(): void {
    this.store.set('onboarded', true);
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  touchStart(e: TouchEvent): void {
    this.x0 = e.changedTouches[0].clientX;
  }

  touchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.x0;
    if (Math.abs(dx) < 60) return;
    // In RTL, swiping right-to-left (dx < 0) moves backwards visually; follow reading direction.
    const forward = this.i18n.isRtl() ? dx > 0 : dx < 0;
    if (forward) this.next();
    else this.prev();
  }
}
