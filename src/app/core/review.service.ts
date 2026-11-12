import { Injectable, computed, inject, signal } from '@angular/core';
import { MedicationService } from './medication.service';
import { StorageService } from './storage.service';

const DAY = 86_400_000;
const REVIEW_NOTIF_ID = 4001;

/** Monthly medication review: in-app banner everywhere, plus a native monthly notification on devices. */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private store = inject(StorageService);
  private meds = inject(MedicationService);

  private _last = signal<string | null>(this.store.get<string | null>('lastReview', null));
  private _enabled = signal<boolean>(this.store.get<boolean>('reviewReminders', true));

  readonly lastReview = this._last.asReadonly();
  readonly remindersEnabled = this._enabled.asReadonly();

  /** Days since the last review (or since the oldest medicine was added if never reviewed). */
  readonly daysSince = computed<number | null>(() => {
    const ref = this._last() ?? this.meds.all().map((m) => m.createdAt).sort()[0] ?? null;
    return ref ? Math.floor((Date.now() - new Date(ref).getTime()) / DAY) : null;
  });

  readonly due = computed(() => {
    const d = this.daysSince();
    return this._enabled() && this.meds.all().length > 0 && d !== null && d >= 30;
  });

  markReviewed(): void {
    const now = new Date().toISOString();
    this._last.set(now);
    this.store.set('lastReview', now);
  }

  async setEnabled(on: boolean, title: string, body: string): Promise<void> {
    this._enabled.set(on);
    this.store.set('reviewReminders', on);
    await this.syncNative(on, title, body);
  }

  /** Schedule (or cancel) a monthly local notification. Silently no-ops on the web. */
  async syncNative(on: boolean, title: string, body: string): Promise<void> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: REVIEW_NOTIF_ID }] });
      if (!on) return;
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: REVIEW_NOTIF_ID,
            title,
            body,
            schedule: { on: { day: Math.min(new Date().getDate(), 28), hour: 10, minute: 0 }, allowWhileIdle: true },
          },
        ],
      });
    } catch {
      /* plugin not installed on this platform */
    }
  }
}
