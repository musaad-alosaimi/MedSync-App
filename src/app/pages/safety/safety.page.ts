import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
import { Severity } from '../../core/models';
import { MedicationService } from '../../core/medication.service';
import { SafetyService } from '../../core/safety.service';
import { AlertCardComponent } from '../../shared/alert-card.component';
import { BackButtonComponent } from '../../shared/back-button.component';

@Component({
  selector: 'app-safety',
  imports: [IonContent, IonButton, IonIcon, AlertCardComponent, BackButtonComponent],
  template: `
    <ion-content>
      <div class="screen">
        <app-back fallback="/tabs/home" />
        <h1 class="center-title">{{ t('safety.title') }}</h1>

        @if (meds.active().length > 0) {
          <p class="status" [class]="'st-' + safety.status()" role="status">
            {{ t('safety.status.' + (safety.status() === 'idle' ? 'checking' : safety.status())) }}
            @if (safety.status() === 'offline') {
              <button type="button" (click)="safety.refresh()">{{ t('common.retry') }}</button>
            }
          </p>
        }

        @if (meds.active().length === 0) {
          <p class="empty">{{ t('safety.nomeds') }}</p>
        } @else if (safety.alerts().length === 0) {
          <section class="card ok">
            <ion-icon name="shield-checkmark" />
            <h2>{{ t('safety.none.title') }}</h2>
            <p>{{ t('safety.none.body') }}</p>
          </section>
        } @else {
          <section class="tiles" [attr.aria-label]="t('safety.summary')">
            @for (s of sevs; track s) {
              <div class="tile" [class]="'sev-' + s">
                <b>{{ safety.counts()[s] }}</b><span>{{ t('sev.' + s) }}</span>
                @if (safety.counts()[s] > 0) {
                  <button type="button" class="hint" [class.open]="openSev() === s" [attr.aria-expanded]="openSev() === s" aria-controls="advice-panel"
                    [attr.aria-label]="t('safety.what') + ': ' + t('sev.' + s)" (click)="toggle(s)">!</button>
                }
              </div>
            }
          </section>
          @if (openSev(); as s) {
            <section id="advice-panel" class="advice" [class]="'sev-' + s" role="note">
              <b>{{ t('safety.what') }} · {{ t('sev.' + s) }}</b>
              @for (a of adviceFor(s); track $index) {
                <p>{{ i18n.bi(a) }}</p>
              }
            </section>
          }
          @for (a of safety.alerts(); track a.id) {
            <app-alert-card [alert]="a" [id]="'a-' + a.id" class="gap" />
          }
        }

        <p class="disc">{{ t('safety.disclaimer') }}</p>
        <ion-button class="btn" (click)="done()">{{ t('safety.done') }}</ion-button>
      </div>
    </ion-content>
  `,
  styles: `
    .status { margin: 0 0 14px; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5; background: #f1f2f4; color: var(--ms-muted); }
    .status.st-online { background: var(--ms-ok-soft); color: var(--ms-ok); }
    .status.st-offline { background: #fff4e5; color: #8a4b00; }
    .status button { margin-inline-start: 8px; border: 0; background: transparent; font: inherit; font-weight: 700; color: inherit; text-decoration: underline; padding: 0; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .tile { background: var(--sev-soft); color: var(--sev); border-radius: 18px; padding: 14px 8px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
    .tile b { font-size: 30px; line-height: 1.1; }
    .tile span { font-size: 15px; font-weight: 700; }
    .hint { margin-top: 6px; align-self: center; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--sev); background: #fff; color: var(--sev); font: inherit; font-size: 18px; font-weight: 800; line-height: 1; padding: 0; cursor: pointer; }
    .hint.open { background: var(--sev); color: #fff; }
    .advice { margin: -6px 0 18px; padding: 12px 14px; background: var(--sev-soft); border-radius: 14px; }
    .advice b { color: var(--sev); font-size: 15px; }
    .advice p { margin: 6px 0 0; font-size: 16px; line-height: 1.5; color: var(--ms-text); }
    .gap { display: block; margin-bottom: 14px; }
    .ok { text-align: center; background: var(--ms-ok-soft); border-color: #bfe3cb; padding: 28px 20px; }
    .ok ion-icon { font-size: 56px; color: var(--ms-ok); }
    .ok h2 { margin: 8px 0; font-size: 22px; }
    .ok p { margin: 0; font-size: 17px; line-height: 1.6; color: #3f4147; text-align: center; }
    .empty { text-align: center; color: var(--ms-muted); font-size: 17px; margin-top: 40px; }
    .disc { color: var(--ms-muted); font-size: 14px; line-height: 1.6; margin: 10px 2px 18px; }
  `,
})
export class SafetyPage {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected safety = inject(SafetyService);
  protected meds = inject(MedicationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected sevs = ['major', 'moderate', 'minor'] as const;
  protected openSev = signal<Severity | null>(null);

  toggle(s: Severity): void {
    this.openSev.update((cur) => (cur === s ? null : s));
  }

  /** Distinct advice texts for the alerts of one severity (most are shared per severity). */
  protected adviceFor(s: Severity) {
    const seen = new Set<string>();
    return this.safety.alerts().filter((a) => a.severity === s).map((a) => a.advice).filter((b) => !seen.has(b.en) && !!seen.add(b.en));
  }

  ionViewWillEnter(): void {
    if (this.safety.status() === 'offline') this.safety.refresh();
  }

  ionViewDidEnter(): void {
    const focus = this.route.snapshot.queryParamMap.get('focus');
    if (focus) document.getElementById('a-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // Opening the report counts as having seen the serious alerts.
    this.safety.acknowledge(this.safety.alerts().filter((a) => a.severity === 'major').map((a) => a.id));
  }

  done(): void {
    this.router.navigateByUrl('/tabs/home', { replaceUrl: true });
  }
}
