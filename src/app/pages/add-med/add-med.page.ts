import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonPicker,
  IonPickerColumn,
  IonPickerColumnOption,
  IonToggle,
  ModalController,
  NavController,
  ToastController,
} from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { MedicationService, todayIso } from '../../core/medication.service';
import { FreqUnit, MED_FORMS, MedForm } from '../../core/models';
import { findDrug, resolveName, searchDrugs } from '../../core/safety/knowledge-base';
import { MedIconComponent } from '../../shared/med-icon.component';
import { DateSheetComponent } from './date-sheet.component';

const DOSES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const COUNTS = Array.from({ length: 30 }, (_, i) => i + 1);
const UNITS: FreqUnit[] = ['hour', 'day', 'week'];

@Component({
  selector: 'app-add-med',
  imports: [IonContent, IonButton, IonIcon, IonPicker, IonPickerColumn, IonPickerColumnOption, IonToggle, MedIconComponent],
  template: `
    <ion-content>
      <div class="wiz">
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="5" [attr.aria-valuenow]="step()">
          @for (n of [1, 2, 3, 4, 5]; track n) {
            <span [class.done]="n <= step()"></span>
          }
        </div>
        <header class="bar">
          <button type="button" class="bar-back" [attr.aria-label]="t('common.back')" (click)="back()"><ion-icon name="chevron-back" [flipRtl]="false" /></button>
          <h1>{{ title() }}</h1>
        </header>

        @switch (step()) {
          @case (1) {
            <div class="pad">
              <div class="search">
                <ion-icon name="search" />
                <input #sInput [placeholder]="t('wiz.name.ph')" [value]="query()" (input)="query.set($any($event.target).value)" (keydown.enter)="useTyped()" autocomplete="off" autocapitalize="words" aria-label="search" />
              </div>
              @if (!query().trim()) {
                <p class="hint">{{ t('wiz.name.hint') }}</p>
              } @else {
                @if (!exact()) {
                  <button type="button" class="res add-as" (click)="useTyped()"><span class="plus"><ion-icon name="add" /></span>{{ t('wiz.name.addas', { q: query().trim() }) }}</button>
                }
                @for (d of results(); track d.id) {
                  <button type="button" class="res" (click)="pick(d.id)">
                    <span><i>{{ prefix(d.en) }}</i>{{ d.en.slice(prefix(d.en).length) }}</span>
                    <small>{{ d.ar }}</small>
                  </button>
                }
              }
            </div>
          }
          @case (2) {
            <div class="pad">
              <ion-picker class="picker one">
                <ion-picker-column [value]="dose()" (ionChange)="dose.set(+$any($event).detail.value)">
                  @for (v of doses; track v) {
                    <ion-picker-column-option [value]="v">{{ v }}</ion-picker-column-option>
                  }
                </ion-picker-column>
              </ion-picker>
              <div class="forms">
                @for (f of forms; track f) {
                  <button type="button" class="form" [class.on]="form() === f" [attr.aria-pressed]="form() === f" (click)="form.set(f)">
                    <span class="tile"><app-med-icon [form]="f" [size]="44" [active]="form() === f && f === 'capsule'" /></span>
                    <span class="lbl">{{ i18n.formLabel(f) }}</span>
                  </button>
                }
              </div>
            </div>
          }
          @case (3) {
            <div class="pad">
              <ion-picker class="picker">
                <ion-picker-column value="every"><ion-picker-column-option value="every">{{ t('wiz.every') }}</ion-picker-column-option></ion-picker-column>
                <ion-picker-column [value]="everyN()" (ionChange)="everyN.set(+$any($event).detail.value)">
                  @for (v of counts; track v) {
                    <ion-picker-column-option [value]="v">{{ v }}</ion-picker-column-option>
                  }
                </ion-picker-column>
                <ion-picker-column [value]="unit()" (ionChange)="unit.set($any($event).detail.value)">
                  @for (u of units; track u) {
                    <ion-picker-column-option [value]="u">{{ t('wiz.unit.' + u) }}</ion-picker-column-option>
                  }
                </ion-picker-column>
              </ion-picker>
              <button type="button" class="card date-row" (click)="pickDate()">
                <ion-icon name="calendar-outline" />
                <span [class.set]="!!startDate()">{{ startDate() ? i18n.formatDate(startDate()) : t('wiz.start') }}</span>
                <ion-icon class="chev" name="chevron-forward" />
              </button>
            </div>
          }
          @case (4) {
            <div class="pad">
              <p class="hint">{{ t('wiz.time.sub') }}</p>
              <input class="time-input" type="time" [value]="time()" (input)="time.set($any($event).detail?.value ?? $any($event).target.value)" aria-label="time" />
              <div class="chips">
                @for (c of quickTimes; track c.key) {
                  <button type="button" [class.on]="time() === c.value" (click)="time.set(c.value)">{{ t('wiz.time.' + c.key) }}<small>{{ c.value }}</small></button>
                }
              </div>
            </div>
          }
          @default {
            <div class="pad">
              <div class="card sum">
                <button type="button" class="sum-row" (click)="jump(1)"><span>{{ t('wiz.name.title') }}</span><b>{{ name() }}</b></button>
                <button type="button" class="sum-row" (click)="jump(2)"><span>{{ t('wiz.dose.label') }}</span><b>{{ dose() }} {{ i18n.formLabel(form()) }}</b></button>
                <button type="button" class="sum-row" (click)="jump(3)"><span>{{ t('wiz.freq.label') }}</span><b>{{ i18n.freqText({ everyN: everyN(), everyUnit: unit() }) }}</b></button>
                <button type="button" class="sum-row" (click)="jump(3)"><span>{{ t('wiz.start') }}</span><b>{{ i18n.formatDate(startDate()) }}</b></button>
                <button type="button" class="sum-row" (click)="jump(4)"><span>{{ t('wiz.time.label') }}</span><b dir="ltr">{{ time() }}</b></button>
              </div>
              <label class="field-label" for="str">{{ t('wiz.strength') }}</label>
              <input id="str" class="field-input" [placeholder]="t('wiz.strength.ph')" [value]="strength()" (input)="strength.set($any($event.target).value)" dir="ltr" />
              <div class="card toggle"><span>{{ t('wiz.active') }}</span><ion-toggle [checked]="active()" (ionChange)="active.set($any($event).detail.checked)" [attr.aria-label]="t('wiz.active')" /></div>
              <p class="note" [class.ok]="!!kbId()">{{ kbId() ? t('wiz.verified') : t('wiz.unverified') }}</p>
            </div>
          }
        }

        @if (step() !== 1) {
        <div class="foot">
          @if (step() === 5) {
            <ion-button class="btn" (click)="save()">{{ t('wiz.save') }}</ion-button>
            @if (editId) {
              <ion-button class="btn btn-danger-text" (click)="remove()"><ion-icon slot="start" name="trash-outline" />{{ t('common.delete') }}</ion-button>
            }
          } @else {
            <ion-button class="btn" [disabled]="!canNext()" (click)="next()">{{ t('common.next') }}</ion-button>
          }
        </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .wiz { min-height: 100%; display: flex; flex-direction: column; padding-top: calc(var(--ion-safe-area-top, 0px) + 10px); }
    .progress { display: flex; gap: 6px; padding: 0 20px; }
    .progress span { flex: 1; height: 3px; border-radius: 3px; background: #d4d4d8; }
    .progress span.done { background: #1a56b7; }
    .bar { position: relative; height: 64px; display: flex; align-items: center; justify-content: center; }
    .bar h1 { margin: 0; font-size: 20px; font-weight: 500; }
    .bar-back { position: absolute; left: 12px; top: 10px; width: 44px; height: 44px; border: 0; background: none; font-size: 26px; color: var(--ms-text); display: grid; place-items: center; }
    .pad { flex: 1; padding: 6px 20px 16px; }
    .foot { padding: 8px 20px calc(var(--ion-safe-area-bottom, 0px) + 20px); display: flex; flex-direction: column; gap: 6px; }
    .search { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--ms-line); border-radius: 18px; padding: 0 16px; height: 58px; margin-bottom: 14px; font-size: 22px; }
    .search input { flex: 1; border: 0; outline: none; background: transparent; font: inherit; font-size: 20px; color: var(--ms-text); min-width: 0; }
    .hint { color: var(--ms-muted); font-size: 16px; margin: 6px 4px 14px; }
    .res { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 0; border-bottom: 1px solid #d9dade; background: transparent; padding: 20px 6px; font: inherit; font-size: 20px; color: var(--ms-text); text-align: start; }
    .res i { font-style: normal; color: var(--ms-primary); }
    .res small { color: var(--ms-muted); font-size: 15px; }
    .add-as { justify-content: flex-start; gap: 12px; font-weight: 700; font-size: 19px; }
    .plus { width: 24px; height: 24px; border-radius: 50%; background: var(--ms-primary); color: #fff; display: grid; place-items: center; font-size: 18px; flex: none; }
    .picker { --highlight-background: transparent; display: flex; justify-content: center; margin: 36px 0 28px; }
    .picker.one { margin-bottom: 40px; }
    .forms { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 10px; }
    .form { border: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 8px; font: inherit; color: var(--ms-text); }
    .tile { width: 100%; aspect-ratio: 1; max-width: 92px; background: #fff; border: 1px solid var(--ms-line); border-radius: 20px; display: grid; place-items: center; }
    .form.on .tile { border-color: var(--ms-primary); box-shadow: 0 0 0 2px #cfe0fb; }
    .lbl { font-size: 16px; }
    .form.on .lbl { color: var(--ms-primary); font-weight: 500; }
    .date-row { display: flex; align-items: center; gap: 14px; width: 100%; font: inherit; font-size: 19px; color: inherit; border-radius: 24px; padding: 18px; }
    .date-row span { flex: 1; text-align: center; }
    .date-row span.set { color: var(--ms-primary); font-weight: 500; }
    .date-row ion-icon { font-size: 24px; }
    .date-row .chev { font-size: 20px; }
    :host-context([dir='ltr']) .date-row .chev { transform: none; }
    .time-input { width: 100%; height: 84px; border-radius: 22px; border: 1px solid var(--ms-line); background: #fff; font: inherit; font-size: 40px; text-align: center; color: var(--ms-text); margin-bottom: 18px; }
    .chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .chips button { border: 1px solid var(--ms-line); background: #fff; border-radius: 16px; padding: 12px 4px; font: inherit; font-size: 16px; color: var(--ms-text); display: flex; flex-direction: column; gap: 2px; align-items: center; }
    .chips button small { color: var(--ms-muted); font-size: 13px; }
    .chips button.on { background: var(--ms-primary); color: #fff; border-color: var(--ms-primary); }
    .chips button.on small { color: #dbe7fd; }
    .sum { padding: 4px 16px; margin-bottom: 20px; }
    .sum-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; border: 0; background: none; font: inherit; font-size: 17px; padding: 14px 0; color: var(--ms-muted); text-align: start; }
    .sum-row + .sum-row { border-top: 1px solid #f0f0f2; }
    .sum-row b { color: var(--ms-text); font-weight: 500; font-size: 18px; }
    .toggle { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; font-size: 18px; }
    .note { margin: 14px 4px 0; font-size: 15px; line-height: 1.6; color: var(--ms-moderate); }
    .note.ok { color: var(--ms-ok); }
  `,
})
export class AddMedPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private meds = inject(MedicationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private nav = inject(NavController);
  private modal = inject(ModalController);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);

  protected readonly doses = DOSES;
  protected readonly counts = COUNTS;
  protected readonly units = UNITS;
  protected readonly forms = MED_FORMS;
  protected readonly quickTimes = [
    { key: 'morning', value: '08:00' },
    { key: 'noon', value: '13:00' },
    { key: 'evening', value: '18:00' },
    { key: 'night', value: '22:00' },
  ];

  protected step = signal(1);
  protected fromReview = false;
  protected editId: string | null = null;

  protected query = signal('');
  protected name = signal('');
  protected kbId = signal<string | undefined>(undefined);
  protected dose = signal(1);
  protected form = signal<MedForm>('capsule');
  protected everyN = signal(1);
  protected unit = signal<FreqUnit>('day');
  protected startDate = signal('');
  protected time = signal('08:00');
  protected strength = signal('');
  protected active = signal(true);

  protected results = computed(() => searchDrugs(this.query(), 8));
  protected exact = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.results().some((r) => r.en.toLowerCase() === q);
  });
  protected canNext = computed(() => (this.step() === 3 ? !!this.startDate() : this.step() === 1 ? !!this.name() : true));
  protected title = computed(() => {
    switch (this.step()) {
      case 1:
        return this.t('wiz.name.title');
      case 2:
        return this.t('wiz.dose.title');
      case 3:
        return this.t('wiz.freq.title');
      case 4:
        return this.t('wiz.time.title');
      default:
        return this.t('wiz.review.title');
    }
  });

  constructor() {
    const id = this.route.snapshot.queryParamMap.get('edit');
    const m = id ? this.meds.get(id) : undefined;
    if (m) {
      this.editId = m.id;
      this.name.set(m.name);
      this.kbId.set(m.kbId);
      this.dose.set(m.dose);
      this.form.set(m.form);
      this.everyN.set(m.everyN);
      this.unit.set(m.everyUnit);
      this.startDate.set(m.startDate);
      this.time.set(m.time);
      this.strength.set(m.strength ?? '');
      this.active.set(m.active);
      this.step.set(5);
    }
  }

  /** The leading part of `name` that matches what the user typed (for highlighting). */
  protected prefix(name: string): string {
    const q = this.query().trim();
    return q && name.toLowerCase().startsWith(q.toLowerCase()) ? name.slice(0, q.length) : '';
  }

  back(): void {
    if (this.step() > 1 && !(this.editId && this.step() === 5)) {
      this.step.set(this.fromReview ? 5 : this.step() - 1);
      this.fromReview = false;
    } else this.nav.navigateBack(this.editId ? '/tabs/meds' : '/tabs/add');
  }

  next(): void {
    if (!this.canNext()) return;
    if (this.fromReview) {
      this.fromReview = false;
      this.step.set(5);
    } else this.step.update((s) => s + 1);
  }

  jump(step: number): void {
    this.fromReview = true;
    this.step.set(step);
  }

  pick(id: string): void {
    const d = findDrug(id)!;
    this.name.set(d.en);
    this.kbId.set(d.id);
    if (!this.editId) this.form.set(d.defaultForm);
    this.next();
  }

  useTyped(): void {
    const n = this.query().trim();
    if (!n) return;
    const known = resolveName(n);
    if (known) return this.pick(known.id);
    this.name.set(n);
    this.kbId.set(undefined);
    this.next();
  }

  async pickDate(): Promise<void> {
    const m = await this.modal.create({ component: DateSheetComponent, componentProps: { initial: this.startDate() || todayIso() }, cssClass: 'sheet' });
    await m.present();
    const { data, role } = await m.onWillDismiss();
    if (role === 'save' && data) this.startDate.set(data);
  }

  async save(): Promise<void> {
    const payload = {
      name: this.name(),
      kbId: this.kbId(),
      strength: this.strength().trim() || undefined,
      dose: this.dose(),
      form: this.form(),
      everyN: this.everyN(),
      everyUnit: this.unit(),
      startDate: this.startDate() || todayIso(),
      time: this.time() || '08:00',
      active: this.active(),
    };
    if (this.editId) this.meds.update(this.editId, payload);
    else this.meds.add({ ...payload, source: 'manual' });
    (await this.toast.create({ message: this.t('wiz.saved'), duration: 1600, position: 'top' })).present();
    this.router.navigateByUrl(this.editId ? '/tabs/meds' : '/tabs/home', { replaceUrl: true });
  }

  async remove(): Promise<void> {
    const a = await this.alerts.create({
      message: this.t('wiz.delete.confirm'),
      buttons: [
        { text: this.t('common.cancel'), role: 'cancel' },
        {
          text: this.t('common.delete'),
          role: 'destructive',
          handler: () => {
            this.meds.remove(this.editId!);
            this.router.navigateByUrl('/tabs/meds', { replaceUrl: true });
          },
        },
      ],
    });
    a.present();
  }
}
