import { Injectable } from '@angular/core';

const PREFIX = 'medsync.';

/** Thin, failure-tolerant wrapper over localStorage (private mode / blocked storage safe). */
@Injectable({ providedIn: 'root' })
export class StorageService {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: state stays in memory only */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }

  /** Remove everything this app stored, except the keys listed. */
  clearAll(keep: string[] = []): void {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX) && !keep.includes(k.slice(PREFIX.length)))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
}
