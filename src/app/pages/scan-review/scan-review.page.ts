import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { MedicationService, todayIso } from '../../core/medication.service';
import { ReviewService } from '../../core/review.service';
import { Candidate, ScanSession } from '../../core/recognition/scan-session.service';
import { KbDrug, searchDrugs } from '../../core/safety/knowledge-base';

@Component({
  selector: 'app-scan-review',
  imports: [IonContent, IonButton, IonIcon],
  template: `
    <ion-content>
      <div class="screen">
        <button type="button" class="back-btn" [attr.aria-label]="t('common.back')" (click)="nav.navigateBack('/scan')"><ion-icon name="chevron-back" flipRtl /></button>
        <h1 class="center-title">{{ t('scan.review.title') }}</h1>

        @if (session.imageUrl(); as url) {
          <div class="photo">
            <img [src]="url" alt="" />
            @if (session.imageSize(); as s) {
              <svg [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h" preserveAspectRatio="none" aria-hidden="true">
                @for (d of session.detections(); track d.drug.id) {
                  @for (b of d.boxes; track $index) {
                    <rect [attr.x]="b.x0 - 4" [attr.y]="b.y0 - 4" [attr.width]="b.x1 - b.x0 + 8" [attr.height]="b.y1 - b.y0 + 8" rx="4" />
                  }
                }
              </svg>
            }
          </div>
        }

        <p class="found">{{ candidates().length ? t('scan.found', { n: candidates().length }) : t('scan.none') }}</p>

        <div class="list">
          @for (c of candidates(); track $index; let i = $index) {
            <button type="button" class="card row" [disabled]="inList(c)" [attr.aria-pressed]="c.selected && !inList(c)" (click)="toggle(i)">
              <span class="circle" [class.on]="c.selected && !inList(c)">@if (c.selected && !inList(c)) {<ion-icon name="checkmark-circle" />}</span>
              <span class="nm"><b>{{ c.name }}</b>@if (c.drug) {<small>{{ i18n.lang() === 'ar' ? c.drug.ar : '' }}</small>}</span>
              @if (inList(c)) {
                <small class="already">{{ t('scan.already') }}</small>
              }
            </button>
          }
        </div>

        @if (adding()) {
          <div class="card add">
            <input class="field-input" [placeholder]="t('scan.search.ph')" [value]="q()" (input)="q.set($any($event.target).value)" autofocus />
            @for (r of results(); track r.id) {
              <button type="button" class="res" (click)="addDrug(r)">{{ r.en }} <small>{{ r.ar }}</small></button>
            }
            @if (q().trim() && !exact()) {
              <button type="button" class="res free" (click)="addFree()">{{ t('wiz.name.addas', { q: q().trim() }) }}</button>
            }
          </div>
        } @else {
          <button type="button" class="card row add-btn" (click)="adding.set(true)">
            <span class="circle plus"><ion-icon name="add" /></span><span class="nm"><b>{{ t('scan.add.missing') }}</b></span>
          </button>
        }

        <p class="disc">{{ t('scan.disclaimer') }}</p>
        <div class="grow"></div>
        <ion-button class="btn" [disabled]="selectedCount() === 0" (click)="confirm()">{{ t('scan.confirm') }} ({{ selectedCount() }})</ion-button>
      </div>
    </ion-content>
  `,
  styles: `
    .photo { position: relative; border-radius: 20px; overflow: hidden; margin-bottom: 16px; background: #000; }
    .photo img { display: block; width: 100%; max-height: 260px; object-fit: contain; }
    .photo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .photo rect { fill: none; stroke: #1aa31a; stroke-width: 3; vector-effect: non-scaling-stroke; }
    .found { font-size: 18px; margin: 0 0 12px; }
    .list { display: flex; flex-direction: column; gap: 10px; }
    .row { display: flex; align-items: center; gap: 14px; width: 100%; font: inherit; color: inherit; text-align: start; min-height: 64px; padding: 10px 16px; border-radius: 18px; }
    .row[disabled] { opacity: 0.6; }
    .circle { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #1f2937; display: grid; place-items: center; flex: none; font-size: 22px; color: #fff; }
    .circle.on { background: var(--ms-primary); border-color: var(--ms-primary); }
    .circle.plus { background: #f1f2f4; border-color: #f1f2f4; color: #1f2937; font-size: 22px; }
    .nm { flex: 1; display: flex; flex-direction: column; }
    .nm b { font-weight: 500; font-size: 18px; }
    small { color: var(--ms-muted); font-size: 14px; }
    .already { color: var(--ms-ok); }
    .add-btn { margin-top: 10px; }
    .add { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
    .res { text-align: start; border: 0; background: transparent; font: inherit; font-size: 18px; padding: 12px 6px; border-top: 1px solid #f0f0f2; color: var(--ms-text); }
    .res.free { color: var(--ms-primary); font-weight: 500; }
    .disc { color: var(--ms-muted); font-size: 14px; margin: 16px 2px 12px; line-height: 1.6; }
    .grow { flex: 1; min-height: 8px; }
  `,
})
export class ScanReviewPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected nav = inject(NavController);
  protected session = inject(ScanSession);
  private meds = inject(MedicationService);
  private review = inject(ReviewService);
  private router = inject(Router);

  protected candidates = this.session.candidates;
  protected adding = signal(false);
  protected q = signal('');
  protected results = computed(() => searchDrugs(this.q(), 5));
  protected exact = computed(() => this.results().some((r) => r.en.toLowerCase() === this.q().trim().toLowerCase()));

  protected selectedCount = computed(() => this.candidates().filter((c) => c.selected && !this.inList(c)).length);

  ionViewWillEnter(): void {
    // Opened directly (refresh/deep link) with nothing scanned: go back to the scanner.
    if (this.candidates().length === 0 && !this.session.imageUrl() && !this.session.demo()) this.router.navigateByUrl('/scan', { replaceUrl: true });
  }

  protected inList(c: Candidate): boolean {
    return this.meds.active().some((m) => (c.drug && m.kbId === c.drug.id) || m.name.toLowerCase() === c.name.toLowerCase());
  }

  toggle(i: number): void {
    this.candidates.update((list) => list.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c)));
  }

  addDrug(d: KbDrug): void {
    if (!this.candidates().some((c) => c.drug?.id === d.id)) this.candidates.update((l) => [...l, { drug: d, name: d.en, selected: true }]);
    this.q.set('');
    this.adding.set(false);
  }

  addFree(): void {
    const name = this.q().trim();
    if (name) this.candidates.update((l) => [...l, { name, selected: true }]);
    this.q.set('');
    this.adding.set(false);
  }

  confirm(): void {
    const chosen = this.candidates().filter((c) => c.selected && !this.inList(c));
    if (!chosen.length) return;
    this.meds.addMany(
      chosen.map((c) => ({
        name: c.name,
        kbId: c.drug?.id,
        ...(c.strength ? { strength: c.strength } : {}),
        dose: 1,
        form: c.drug?.defaultForm ?? 'pill',
        everyN: 1,
        everyUnit: 'day' as const,
        startDate: todayIso(),
        time: '08:00',
        active: true,
        source: 'scan' as const,
      })),
    );
    this.review.markReviewed();
    this.session.reset();
    // Home shows the conflict pop-up for serious findings, plus the summary and a link to the full report.
    this.router.navigateByUrl('/tabs/home', { replaceUrl: true });
  }
}
