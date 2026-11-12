import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ProfileService } from './core/profile.service';
import { StorageService } from './core/storage.service';

/** Decides where a user should land given what they have completed so far. */
@Injectable({ providedIn: 'root' })
export class StartService {
  private store = inject(StorageService);
  private auth = inject(AuthService);
  private profile = inject(ProfileService);

  target(): string {
    if (!this.store.get('onboarded', false)) return '/onboarding';
    if (!this.auth.loggedIn()) return '/login';
    if (!this.profile.profile().completed) return '/profile-setup';
    return '/tabs/home';
  }
}

/** For use inside an injection context (route `redirectTo`, guards). */
export const startTarget = (): string => inject(StartService).target();

export const authGuard: CanActivateFn = () => (inject(AuthService).loggedIn() ? true : inject(Router).parseUrl('/login'));

export const profileGuard: CanActivateFn = () => {
  return inject(ProfileService).profile().completed ? true : inject(Router).parseUrl('/profile-setup');
};

export const guestGuard: CanActivateFn = () => (inject(AuthService).loggedIn() ? inject(Router).parseUrl(inject(StartService).target()) : true);
