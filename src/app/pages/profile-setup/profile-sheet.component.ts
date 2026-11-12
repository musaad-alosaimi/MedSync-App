import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon, ModalController } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { ALLERGY_OPTIONS, CHRONIC_CONDITIONS } from '../../core/safety/knowledge-base';

export type SheetMode = 'age' | 'chronic' | 'allergies' | 'history' | 'notes';

/** Bottom sheet used by the health-profile page: dismisses with the edited value. */
@Component({
  selector: 'app-profile-sheet',
  imports: [IonButton, IonIcon],
  template: `
    <div class="sheet-body">
      <div class="sheet-head">
        <h2>{{ t('profile.' + modeSig() + '.title') }}</h2>
        <button type="button" class="sheet-close" [attr.aria-label]="t('common.close')" (click)="close()"><ion-icon name="close" /></button>
      </div>

      @switch (modeSig()) {
        @case ('age') {
          <div class="field">
            <input class="field-input" type="number" inputmode="numeric" min="1" max="120" [placeholder]="t('profile.age.ph')"
              [value]="ageText()" (input)="ageText.set($any($event.target).value)" />
          </div>
          @if (ageError()) {
            <p class="form-error" role="alert">{{ t('profile.age.invalid') }}</p>
          }
        }
        @case ('notes') {
          <textarea class="notes" rows="5" [placeholder]="t('profile.notes.ph')" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
        }
        @default {
          <div class="list card">
            @if (modeSig() === 'chronic' || modeSig() === 'allergies') {
              @for (o of options(); track o.id) {
                <button type="button" class="row" [attr.aria-pressed]="selected().includes(o.id)" (click)="toggle(o.id)">
                  <span class="circle" [class.on]="selected().includes(o.id)">@if (selected().includes(o.id)) {<ion-icon name="checkmark-circle" />}</span>
                  <span>{{ i18n.lang() === 'ar' ? o.ar : o.en }}</span>
                </button>
              }
            }
            @for (item of customItems(); track item) {
              <div class="row">
                <button type="button" class="circle on" [attr.aria-label]="t('common.delete')" (click)="removeCustom(item)"><ion-icon name="close" /></button>
                <span>{{ display(item) }}</span>
              </div>
            }
            @if (adding()) {
              <div class="row add-row">
                <input class="field-input" #inp [placeholder]="t('profile.custom.ph')" [value]="draft()" (input)="draft.set($any($event.target).value)"
                  (keydown.enter)="commitDraft()" (blur)="commitDraft()" autofocus />
              </div>
            } @else {
              <button type="button" class="row" (click)="adding.set(true)">
                <span class="circle plus"><ion-icon name="add" /></span>
                <span>{{ t(addKey()) }}</span>
              </button>
            }
          </div>
        }
      }

      <ion-button class="btn" style="margin-top: 20px" (click)="save()">{{ t('common.save') }}</ion-button>
    </div>
  `,
  styles: `
    .list { padding: 6px 14px; }
    .row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px; border: 0; background: transparent; font: inherit; font-size: 18px; color: var(--ms-text); text-align: start; }
    .row + .row { border-top: 1px solid #f0f0f2; }
    .circle { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #1f2937; display: grid; place-items: center; flex: none; font-size: 22px; background: transparent; padding: 0; color: #1f2937; }
    .circle.on { background: var(--ms-primary); border-color: var(--ms-primary); color: #fff; }
    .circle.plus { background: #f1f2f4; border-color: #f1f2f4; font-size: 24px; }
    .add-row .field-input { height: 48px; }
    .notes { width: 100%; border-radius: 16px; border: 1px solid var(--ms-line); background: #fff; padding: 14px 16px; font: inherit; font-size: 17px; resize: none; outline: none; }
  `,
})
export class ProfileSheetComponent implements OnInit {
  // Plain @Input()s: Ionic assigns componentProps directly onto the instance.
  @Input() mode: SheetMode = 'chronic';
  /** Initial value: number | null for age, string[] for lists, string for notes. */
  @Input() initial: number | string[] | string | null = null;
  protected modeSig = signal<SheetMode>('chronic');

  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private modalCtrl = inject(ModalController);

  protected selected = signal<string[]>([]);
  protected ageText = signal('');
  protected text = signal('');
  protected adding = signal(false);
  protected draft = signal('');
  protected ageError = signal(false);

  protected options = computed(() => (this.modeSig() === 'chronic' ? CHRONIC_CONDITIONS : ALLERGY_OPTIONS));
  protected customItems = computed(() => this.selected().filter((s) => (this.modeSig() === 'history' ? true : s.startsWith('custom:'))));
  protected addKey = computed(() => `profile.add.${this.modeSig() === 'chronic' ? 'disease' : this.modeSig() === 'allergies' ? 'allergy' : 'history'}`);

  ngOnInit(): void {
    this.modeSig.set(this.mode);
    const v = this.initial;
    if (this.mode === 'age') this.ageText.set(typeof v === 'number' ? String(v) : '');
    else if (this.mode === 'notes') this.text.set(typeof v === 'string' ? v : '');
    else if (Array.isArray(v)) this.selected.set([...v]);
  }

  protected display(item: string): string {
    return item.startsWith('custom:') ? item.slice(7) : item;
  }

  protected toggle(id: string): void {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  protected removeCustom(item: string): void {
    this.selected.update((s) => s.filter((x) => x !== item));
  }

  protected commitDraft(): void {
    const v = this.draft().trim();
    this.draft.set('');
    this.adding.set(false);
    if (!v) return;
    const entry = this.modeSig() === 'history' ? v : `custom:${v}`;
    this.selected.update((s) => (s.includes(entry) ? s : [...s, entry]));
  }

  protected close(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  protected save(): void {
    if (this.adding()) this.commitDraft();
    switch (this.modeSig()) {
      case 'age': {
        const n = Number(this.ageText());
        if (!Number.isFinite(n) || n < 1 || n > 120) return void this.ageError.set(true);
        return void this.modalCtrl.dismiss(Math.round(n), 'save');
      }
      case 'notes':
        return void this.modalCtrl.dismiss(this.text().trim(), 'save');
      default:
        return void this.modalCtrl.dismiss(this.selected(), 'save');
    }
  }
}
