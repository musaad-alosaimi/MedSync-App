import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular';
import { AuthError, AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n.service';
import { StartService } from '../../guards';
import { BackButtonComponent } from '../../shared/back-button.component';

@Component({
  selector: 'app-login',
  imports: [IonContent, IonButton, IonIcon, BackButtonComponent],
  template: `
    <ion-content>
      <div class="screen">
        <app-back fallback="/onboarding" />
        <h1 class="page-title">{{ t('login.title') }}</h1>
        <p class="page-sub">{{ t('login.subtitle') }}</p>

        <form (submit)="submit($event)" novalidate>
          <div class="field">
            <label class="field-label" for="login-email">{{ t('auth.email') }}</label>
            <input id="login-email" class="field-input" type="email" inputmode="email" autocomplete="email" [placeholder]="t('auth.email.ph')"
              [value]="email()" (input)="email.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label class="field-label" for="login-pw">{{ t('auth.password') }}</label>
            <input id="login-pw" class="field-input has-icon" [type]="show() ? 'text' : 'password'" autocomplete="current-password"
              [placeholder]="t('auth.password.ph')" [value]="password()" (input)="password.set($any($event.target).value)" />
            <button type="button" class="field-icon" [attr.aria-label]="show() ? 'hide' : 'show'" (click)="show.set(!show())">
              <ion-icon [name]="show() ? 'eye-outline' : 'eye-off-outline'" />
            </button>
          </div>
          @if (error()) {
            <p class="form-error" role="alert">{{ error() }}</p>
          }
          <ion-button class="btn" type="submit">{{ t('login.btn') }}</ion-button>
        </form>

        <p class="forgot">{{ t('login.forgot') }} <button type="button" class="link" (click)="forgot()">{{ t('login.forgot.link') }}</button></p>

        <div class="or"><span></span><b>{{ t('common.or') }}</b><span></span></div>

        <ion-button class="btn btn-white social" (click)="social('apple')"><ion-icon slot="start" name="logo-apple" />{{ t('login.apple') }}</ion-button>
        <ion-button class="btn btn-white social" (click)="social('google')"><ion-icon slot="start" name="logo-google" />{{ t('login.google') }}</ion-button>

        <div class="grow"></div>
        <p class="bottom">{{ t('login.noaccount') }} <button type="button" class="link" (click)="go('/register')">{{ t('login.create') }}</button></p>
      </div>
    </ion-content>
  `,
  styles: `
    .forgot { text-align: center; margin: 18px 0 20px; font-size: 16px; }
    .or { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; color: var(--ms-muted); }
    .or span { flex: 1; height: 1px; background: #9ca3af; }
    .social { margin-bottom: 12px; }
    .grow { flex: 1; min-height: 20px; }
    .bottom { text-align: center; margin: 0; font-size: 16px; }
  `,
})
export class LoginPage {
  private i18n = inject(I18n);
  protected t = this.i18n.t;
  private auth = inject(AuthService);
  private router = inject(Router);
  private start = inject(StartService);
  private toast = inject(ToastController);
  private alerts = inject(AlertController);

  protected email = signal('');
  protected password = signal('');
  protected show = signal(false);
  protected error = signal('');

  submit(e: Event): void {
    e.preventDefault();
    if (!this.email().trim() || !this.password()) return void this.error.set(this.t('err.empty'));
    try {
      this.auth.login(this.email(), this.password());
      this.router.navigateByUrl(this.start.target(), { replaceUrl: true });
    } catch (err) {
      this.error.set(err instanceof AuthError ? this.t('err.' + err.code) : this.t('err.invalid'));
    }
  }

  async social(provider: 'apple' | 'google'): Promise<void> {
    this.auth.socialLogin(provider, this.i18n.lang() === 'ar' ? 'أحمد' : 'Ahmed');
    (await this.toast.create({ message: this.t('auth.social.demo'), duration: 2200, position: 'top' })).present();
    this.router.navigateByUrl(this.start.target(), { replaceUrl: true });
  }

  async forgot(): Promise<void> {
    (await this.alerts.create({ message: this.t('login.forgot.msg'), buttons: [this.t('common.ok')] })).present();
  }

  go(url: string): void {
    this.router.navigateByUrl(url);
  }
}
