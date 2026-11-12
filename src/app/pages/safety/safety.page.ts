import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { I18n } from '../../core/i18n.service';
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
              <div class="tile" [class]="'sev-' + s"><b>{{ safety.counts()[s] }}</b><span>{{ t('sev.' + s) }}</span></div>
            }
          </section>
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
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .tile { background: var(--sev-soft); color: var(--sev); border-radius: 18px; padding: 14px 8px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
    .tile b { font-size: 30px; line-height: 1.1; }
    .tile span { font-size: 15px; font-weight: 700; }
    .gap { display: block; margin-bottom: 14px; }
    .ok { text-align: center; background: var(--ms-ok-soft); border-color: #bfe3cb; padding: 28px 20px; }
    .ok ion-icon { font-size: 56px; color: var(--ms-ok); }
    .ok h2 { margin: 8px 0; font-size: 22px; }
    .ok p { margin: 0; font-size: 17px; line-height: 1.6; color: #3f4147; }
    .empty { text-align: center; color: var(--ms-muted); font-size: 17px; margin-top: 40px; }
    .disc { color: var(--ms-muted); font-size: 14px; line-height: 1.6; margin: 10px 2px 18px; }
  `,
})
export class SafetyPage {
  protected t = inject(I18n).t;
  protected safety = inject(SafetyService);
  protected meds = inject(MedicationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected sevs = ['major', 'moderate', 'minor'] as const;

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
