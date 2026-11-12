import { Injectable, computed, inject, signal } from '@angular/core';
import { MedicationService } from './medication.service';
import { ProfileService } from './profile.service';
import { SafetyAlert } from './models';
import { analyze, summarize } from './safety/safety-engine';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class SafetyService {
  private meds = inject(MedicationService);
  private profile = inject(ProfileService);
  private store = inject(StorageService);

  private acked = signal<string[]>(this.store.get<string[]>('acked', []));

  readonly alerts = computed<SafetyAlert[]>(() => analyze(this.meds.all(), this.profile.profile()));
  readonly counts = computed(() => summarize(this.alerts()));
  /** Major alerts the user has not yet dismissed with "I'll review with my doctor". */
  readonly pendingMajor = computed(() => this.alerts().filter((a) => a.severity === 'major' && !this.acked().includes(a.id)));

  acknowledge(ids: string[]): void {
    const next = [...new Set([...this.acked(), ...ids])];
    this.acked.set(next);
    this.store.set('acked', next);
  }

  byId(id: string): SafetyAlert | undefined {
    return this.alerts().find((a) => a.id === id);
  }
}
