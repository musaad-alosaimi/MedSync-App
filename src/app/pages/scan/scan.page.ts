import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, NavController } from '@ionic/angular';
import { ClinicalApiService } from '../../core/clinical/clinical-api.service';
import { toApiPatient } from '../../core/clinical/clinical-mapper';
import { I18n } from '../../core/i18n.service';
import { ProfileService } from '../../core/profile.service';
import { RecognitionService } from '../../core/recognition/recognition.service';
import { Candidate, ScanSession } from '../../core/recognition/scan-session.service';
import { resolveName } from '../../core/safety/knowledge-base';

@Component({
  selector: 'app-scan',
  imports: [IonContent, IonButton, IonIcon, IonSpinner],
  template: `
    <ion-content [scrollY]="false">
      <div class="scan">
        <button type="button" class="back-btn" [attr.aria-label]="t('common.back')" (click)="nav.navigateBack('/tabs/home')"><ion-icon name="chevron-back" flipRtl /></button>
        <h1>{{ t('scan.title') }}</h1>

        <div class="viewport">
          <video #video playsinline muted autoplay [hidden]="!cameraOn()"></video>
          @if (cameraOn()) {
            <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
          } @else if (!busy()) {
            <div class="fallback">
              <ion-icon name="camera" />
              <p>{{ t('scan.camera.error') }}</p>
            </div>
          }
          @if (busy()) {
            <div class="busy" role="status">
              <ion-spinner name="crescent" />
              <b>{{ t('scan.analyzing') }}</b>
              <span>{{ t('scan.analyzing.sub') }}</span>
            </div>
          }
        </div>

        @if (error()) {
          <p class="form-error err" role="alert">{{ error() }}</p>
        }

        <div class="actions">
          @if (cameraOn()) {
            <ion-button class="btn green" [disabled]="busy()" (click)="capture()">{{ t('scan.ready') }}</ion-button>
          }
          <div class="secondary">
            <ion-button class="btn btn-white" [disabled]="busy()" (click)="file.click()"><ion-icon slot="start" name="images-outline" />{{ t('scan.gallery') }}</ion-button>
            <ion-button class="btn btn-white" [disabled]="busy()" (click)="demo()">{{ t('scan.demo') }}</ion-button>
          </div>
        </div>
        <p class="priv">{{ t('scan.privacy') }}</p>
        <input #file type="file" accept="image/*" hidden (change)="picked($event)" />
      </div>
    </ion-content>
  `,
  styles: `
    .scan { height: 100%; display: flex; flex-direction: column; padding: calc(var(--ion-safe-area-top, 0px) + 12px) 0 calc(var(--ion-safe-area-bottom, 0px) + 16px); }
    h1 { text-align: center; font-size: 19px; font-weight: 500; margin: 0 56px 14px; line-height: 1.5; min-height: 29px; }
    .viewport { position: relative; flex: 1; background: #1d1d1f; overflow: hidden; min-height: 200px; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .corner { position: absolute; width: 46px; height: 46px; border: 0 solid #1aa31a; }
    .tl { top: 16px; left: 16px; border-top-width: 5px; border-left-width: 5px; border-top-left-radius: 8px; }
    .tr { top: 16px; right: 16px; border-top-width: 5px; border-right-width: 5px; border-top-right-radius: 8px; }
    .bl { bottom: 16px; left: 16px; border-bottom-width: 5px; border-left-width: 5px; border-bottom-left-radius: 8px; }
    .br { bottom: 16px; right: 16px; border-bottom-width: 5px; border-right-width: 5px; border-bottom-right-radius: 8px; }
    .fallback { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; color: #d4d4d8; text-align: center; padding: 24px; font-size: 17px; line-height: 1.6; }
    .fallback ion-icon { font-size: 56px; }
    .busy { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.62); color: #fff; display: grid; place-content: center; justify-items: center; gap: 10px; text-align: center; padding: 24px; }
    .busy b { font-size: 20px; font-weight: 500; }
    .busy span { font-size: 15px; opacity: 0.85; }
    .busy ion-spinner { width: 44px; height: 44px; color: #fff; }
    .actions { padding: 14px 20px 0; display: flex; flex-direction: column; gap: 10px; }
    .green { --background: #1aa31a; --background-activated: #138a13; }
    .secondary { display: flex; gap: 10px; }
    .secondary .btn { height: 50px; font-size: 16px; --padding-start: 10px; --padding-end: 10px; }
    .err { margin: 12px 20px 0; }
    .priv { margin: 10px 20px 0; color: #a1a1aa; font-size: 12px; line-height: 1.5; text-align: center; }
  `,
})
export class ScanPage implements OnDestroy {
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected nav = inject(NavController);
  private router = inject(Router);
  private recognition = inject(RecognitionService);
  private session = inject(ScanSession);
  private api = inject(ClinicalApiService);
  private profile = inject(ProfileService);

  private video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private stream?: MediaStream;
  protected cameraOn = signal(false);
  protected busy = signal(false);
  protected error = signal('');

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    this.busy.set(false);
    await this.startCamera();
  }

  ionViewWillLeave(): void {
    this.stopCamera();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private async startCamera(): Promise<void> {
    this.stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play().catch(() => undefined);
      this.cameraOn.set(true);
    } catch {
      this.cameraOn.set(false);
    }
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.cameraOn.set(false);
  }

  capture(): void {
    const v = this.video().nativeElement;
    if (!v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && this.process(b), 'image/jpeg', 0.9);
  }

  picked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) this.process(f);
  }

  private async process(blob: Blob): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.session.reset();
    // 1) the Python server (OCR, then a vision-model fallback, then the clinical database); 2) on-device OCR if it is unreachable or finds nothing
    if (await this.processOnServer(blob)) {
      this.busy.set(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      const r = await this.recognition.identify(blob);
      this.session.imageUrl.set(url);
      this.session.imageSize.set({ w: r.imageWidth, h: r.imageHeight });
      this.session.detections.set(r.detections);
      this.session.candidates.set(r.detections.map<Candidate>((d) => ({ drug: d.drug, name: d.drug.en, selected: true })));
      this.router.navigateByUrl('/scan-review');
    } catch {
      URL.revokeObjectURL(url);
      this.error.set(this.t('scan.error'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Returns true when the server found at least one medicine and the review page was opened. */
  private async processOnServer(blob: Blob): Promise<boolean> {
    try {
      const res = await this.api.scan(blob, toApiPatient(this.profile.profile()));
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      const candidates = res.packages.flatMap<Candidate>((p) => {
        if (p.status === 'identified' && p.ingredients.length) {
          return [
            {
              // a KB id only for a single-ingredient pack, so the on-device rules still apply to it
              drug: p.ingredients.length === 1 ? resolveName(p.ingredients[0]) : undefined,
              name: p.brand ?? p.ingredients.map(cap).join(' / '),
              strength: Object.values(p.strengths)[0],
              // vision-model reads the model was unsure about are offered unticked so the user confirms them
              selected: !p.vision?.low_trust,
            },
          ];
        }
        // The vision model saw something the database does not know: offer it unticked so the user decides.
        const seen = p.vision?.brand ?? p.vision?.ingredients[0];
        return seen ? [{ name: seen, strength: p.vision?.strength ?? undefined, selected: false }] : [];
      });
      if (!candidates.some((c) => c.selected || res.engine?.includes('vision'))) return false;
      this.session.imageUrl.set(res.annotated_png_base64 ? `data:image/png;base64,${res.annotated_png_base64}` : URL.createObjectURL(blob));
      this.session.candidates.set(candidates);
      this.router.navigateByUrl('/scan-review');
      return true;
    } catch {
      return false; // offline / server down: fall back to on-device OCR
    }
  }

  demo(): void {
    this.session.reset();
    this.session.demo.set(true);
    this.session.candidates.set(this.recognition.demoSet().map<Candidate>((d) => ({ drug: d, name: d.en, selected: true })));
    this.router.navigateByUrl('/scan-review');
  }
}
