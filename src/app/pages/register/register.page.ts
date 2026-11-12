import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { AuthError, AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n.service';
import { StartService } from '../../guards';
import { BackButtonComponent } from '../../shared/back-button.component';

@Component({
  selector: 'app-register',
  imports: [IonContent, IonButton, BackButtonComponent],
  template: `
    <ion-content>
      <div class="screen">
        <app-back fallback="/login" />
        <h1 class="page-title">{{ t('register.title') }}</h1>
        <p class="page-sub">{{ t('register.subtitle') }}</p>

        <form (submit)="submit($event)" novalidate>
          <div class="field">
            <label class="field-label" for="reg-name">{{ t('auth.name') }}</label>
            <input id="reg-name" class="field-input" autocomplete="name" [placeholder]="t('auth.name.ph')" [value]="name()" (input)="name.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label class="field-label" for="reg-email">{{ t('auth.email') }}</label>
            <input id="reg-email" class="field-input" type="email" inputmode="email" autocomplete="email" [placeholder]="t('auth.email.ph')" [value]="email()" (input)="email.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label class="field-label" for="reg-pw">{{ t('auth.password') }}</label>
            <input id="reg-pw" class="field-input" type="password" autocomplete="new-password" [placeholder]="t('auth.password.ph')" [value]="password()" (input)="password.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label class="field-label" for="reg-pw2">{{ t('auth.confirm') }}</label>
            <input id="reg-pw2" class="field-input" type="password" autocomplete="new-password" [placeholder]="t('auth.password.ph')" [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
          </div>
          @if (error()) {
            <p class="form-error" role="alert">{{ error() }}</p>
          }
          <ion-button class="btn" type="submit">{{ t('register.btn') }}</ion-button>
        </form>

        <div class="grow"></div>
        <p class="bottom">{{ t('register.have') }} <button type="button" class="link" (click)="back()">{{ t('register.signin') }}</button></p>
      </div>
    </ion-content>
  `,
  styles: `
    .grow { flex: 1; min-height: 24px; }
    .bottom { text-align: center; margin: 0; font-size: 16px; }
  `,
})
export class RegisterPage {
  protected t = inject(I18n).t;
  private auth = inject(AuthService);
  private router = inject(Router);
  private start = inject(StartService);

  protected name = signal('');
  protected email = signal('');
  protected password = signal('');
  protected confirm = signal('');
  protected error = signal('');

  submit(e: Event): void {
    e.preventDefault();
    if (!this.name().trim() || !this.email().trim() || !this.password()) return void this.error.set(this.t('err.empty'));
    if (this.password() !== this.confirm()) return void this.error.set(this.t('err.mismatch'));
    try {
      this.auth.register(this.name(), this.email(), this.password());
      this.router.navigateByUrl(this.start.target(), { replaceUrl: true });
    } catch (err) {
      this.error.set(err instanceof AuthError ? this.t('err.' + err.code) : this.t('err.invalid'));
    }
  }

  back(): void {
    this.router.navigateByUrl('/login');
  }
}
