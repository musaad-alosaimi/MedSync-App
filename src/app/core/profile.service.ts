import { Injectable, inject, signal } from '@angular/core';
import { EMPTY_PROFILE, HealthProfile } from './models';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private store = inject(StorageService);
  private _profile = signal<HealthProfile>({ ...EMPTY_PROFILE, ...this.store.get<Partial<HealthProfile>>('profile', {}) });
  readonly profile = this._profile.asReadonly();

  update(patch: Partial<HealthProfile>): void {
    const next = { ...this._profile(), ...patch };
    this._profile.set(next);
    this.store.set('profile', next);
  }

  reset(): void {
    this._profile.set({ ...EMPTY_PROFILE });
    this.store.remove('profile');
  }
}
