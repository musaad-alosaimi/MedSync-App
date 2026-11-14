import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, ModalController, NavController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n.service';
import { ProfileService } from '../../core/profile.service';
import { ALLERGY_OPTIONS, CHRONIC_CONDITIONS, optionLabel } from '../../core/safety/knowledge-base';
import { ProfileSheetComponent, SexValue, SheetMode } from './profile-sheet.component';

interface Card {
  mode: SheetMode;
  summary: () => string;
}

@Component({
  selector: 'app-profile-setup',
  imports: [IonContent, IonButton, IonIcon],
  template: `
    <ion-content>
      <div class="screen">
        @if (editing) {
          <button type="button" class="back-btn" [attr.aria-label]="t('common.back')" (click)="nav.navigateBack('/tabs/settings')"><ion-icon name="chevron-back" flipRtl /></button>
        }
        <h1 class="center-title">{{ t('profile.title') }}</h1>

        <div class="hello">
          <div class="avatar" aria-hidden="true">{{ initial() }}</div>
          <div>
            <div class="hello-name">{{ t('profile.hello', { name: auth.user()?.name ?? '' }) }}</div>
            <div class="hello-sub">{{ t('profile.sub') }}</div>
          </div>
        </div>

        <h2 class="section">{{ t('profile.complete') }}</h2>
        <div class="cards">
          @for (c of cards; track c.mode) {
            <button type="button" class="card item" (click)="open(c.mode)">
              <span class="ico" aria-hidden="true"><ion-icon [name]="icons[c.mode]" /></span>
              <span class="txt">
                <b>{{ t('profile.' + c.mode) }}</b>
                <small [class.filled]="c.summary() !== t('profile.tap')">{{ c.summary() }}</small>
              </span>
              <ion-icon class="chev" name="chevron-forward" flipRtl />
            </button>
          }
        </div>

        <div class="grow"></div>
        @if (!ready()) {
          <p class="hint">{{ t('profile.age.required') }}</p>
        }
        <ion-button class="btn" [disabled]="!ready()" (click)="finish()">{{ editing ? t('common.save') : t('profile.continue') }}</ion-button>
      </div>
    </ion-content>
  `,
  styles: `
    .hello { display: flex; align-items: center; gap: 16px; margin: 4px 0 26px; }
    .avatar { width: 68px; height: 68px; border-radius: 50%; background: var(--ms-primary); color: #fff; display: grid; place-items: center; font-size: 28px; font-weight: 700; flex: none; }
    .hello-name { font-size: 22px; font-weight: 500; }
    .hello-sub { color: var(--ms-primary); font-size: 16px; margin-top: 2px; }
    .section { font-size: 19px; font-weight: 500; margin: 0 0 14px; }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .item { display: flex; align-items: center; gap: 14px; width: 100%; font: inherit; color: inherit; text-align: start; padding: 14px 16px; border-radius: 22px; }
    .ico { width: 46px; height: 46px; border-radius: 50%; background: #eeeff1; display: grid; place-items: center; font-size: 24px; flex: none; }
    .txt { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .txt b { font-weight: 500; font-size: 18px; }
    .txt small { color: var(--ms-muted); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .txt small.filled { color: var(--ms-primary); }
    .chev { font-size: 20px; }
    .grow { flex: 1; min-height: 24px; }
    .hint { color: var(--ms-muted); text-align: center; margin: 0 0 12px; font-size: 15px; }
  `,
})
export class ProfileSetupPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected auth = inject(AuthService);
  protected nav = inject(NavController);
  private profileSvc = inject(ProfileService);
  private modal = inject(ModalController);
  private router = inject(Router);

  protected editing = this.profileSvc.profile().completed;
  protected p = this.profileSvc.profile;
  protected ready = computed(() => (this.p().age ?? 0) > 0);
  protected initial = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0).toUpperCase());

  protected icons: Record<SheetMode, string> = {
    age: 'time-outline',
    sex: 'person-outline',
    chronic: 'medkit-outline',
    allergies: 'alert-circle',
    history: 'calendar-outline',
    notes: 'information-circle-outline',
  };

  private list(ids: string[], opts: { id: string; en: string; ar: string }[]): string {
    return ids.length ? ids.map((i) => optionLabel(opts, i, this.i18n.lang())).join('، ') : this.t('profile.tap');
  }

  private sexSummary(): string {
    const p = this.p();
    if (!p.sex) return this.t('profile.tap');
    const parts = [this.t(p.sex === 'F' ? 'profile.sex.female' : 'profile.sex.male')];
    if (p.pregnant) parts.push(this.t('profile.sex.pregnant'));
    if (p.breastfeeding) parts.push(this.t('profile.sex.breastfeeding'));
    return parts.join('، ');
  }

  protected cards: Card[] = [
    { mode: 'age', summary: () => (this.p().age ? this.t('profile.yrs', { n: this.p().age! }) : this.t('profile.tap')) },
    { mode: 'sex', summary: () => this.sexSummary() },
    { mode: 'chronic', summary: () => this.list(this.p().chronic, CHRONIC_CONDITIONS) },
    { mode: 'allergies', summary: () => this.list(this.p().allergies, ALLERGY_OPTIONS) },
    { mode: 'history', summary: () => (this.p().history.length ? this.p().history.join('، ') : this.t('profile.tap')) },
    { mode: 'notes', summary: () => this.p().notes || this.t('profile.tap') },
  ];

  async open(mode: SheetMode): Promise<void> {
    const p = this.p();
    const initial: number | string[] | string | SexValue | null =
      mode === 'sex' ? { sex: p.sex, pregnant: p.pregnant, breastfeeding: p.breastfeeding } : mode === 'age' ? p.age : mode === 'chronic' ? p.chronic : mode === 'allergies' ? p.allergies : mode === 'history' ? p.history : p.notes;
    const m = await this.modal.create({
      component: ProfileSheetComponent,
      componentProps: { mode, initial },
      cssClass: 'sheet',
      keyboardClose: true,
    });
    await m.present();
    const { data, role } = await m.onWillDismiss();
    if (role !== 'save') return;
    if (mode === 'sex') {
      this.profileSvc.update(data as SexValue);
      return;
    }
    const key = mode === 'age' ? 'age' : mode === 'chronic' ? 'chronic' : mode === 'allergies' ? 'allergies' : mode === 'history' ? 'history' : 'notes';
    this.profileSvc.update({ [key]: data });
  }

  finish(): void {
    this.profileSvc.update({ completed: true });
    if (this.editing) this.nav.navigateBack('/tabs/settings');
    else this.router.navigateByUrl('/tabs/home', { replaceUrl: true });
  }
}
