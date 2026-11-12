import { Injectable, computed, inject, signal } from '@angular/core';
import { User } from './models';
import { sha256 } from './sha256';
import { StorageService } from './storage.service';

interface StoredAccount extends User {
  salt: string;
  hash: string;
}

export class AuthError extends Error {
  constructor(public code: 'invalid' | 'exists' | 'weak' | 'email') {
    super(code);
  }
}

/**
 * Local-only authentication placeholder (no backend yet).
 * Accounts live in this device's storage with a salted SHA-256 hash.
 * Swap the three public methods for real API calls (and real Apple/Google SDKs) when a backend exists.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private store = inject(StorageService);
  private _user = signal<User | null>(this.store.get<User | null>('session', null));
  readonly user = this._user.asReadonly();
  readonly loggedIn = computed(() => this._user() !== null);

  private accounts(): StoredAccount[] {
    return this.store.get<StoredAccount[]>('accounts', []);
  }

  private open(u: User) {
    this.store.set('session', u);
    this._user.set(u);
  }

  register(name: string, email: string, password: string): void {
    email = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new AuthError('email');
    if (password.length < 6) throw new AuthError('weak');
    const list = this.accounts();
    if (list.some((a) => a.email === email)) throw new AuthError('exists');
    const salt = crypto.getRandomValues(new Uint32Array(2)).join('-');
    const acc: StoredAccount = { name: name.trim() || email.split('@')[0], email, provider: 'email', salt, hash: sha256(salt + password) };
    this.store.set('accounts', [...list, acc]);
    this.open({ name: acc.name, email, provider: 'email' });
  }

  login(email: string, password: string): void {
    email = email.trim().toLowerCase();
    const acc = this.accounts().find((a) => a.email === email);
    if (!acc || acc.hash !== sha256(acc.salt + password)) throw new AuthError('invalid');
    this.open({ name: acc.name, email, provider: 'email' });
  }

  /** Demo stand-in for Apple / Google sign-in. */
  socialLogin(provider: 'apple' | 'google', name: string): void {
    this.open({ name, email: `${provider}.user@medsync.local`, provider });
  }

  logout(): void {
    this.store.remove('session');
    this._user.set(null);
  }
}
