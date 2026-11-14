import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ClinicalApiService } from './clinical/clinical-api.service';
import { ApiMedicine, ApiPatient, DATABASE_KINDS, identifiedRefs, toAlerts, toApiMedicines, toApiPatient } from './clinical/clinical-mapper';
import { MedicationService } from './medication.service';
import { ProfileService } from './profile.service';
import { Medication, SafetyAlert } from './models';
import { SEVERITY_ORDER, analyze, summarize } from './safety/safety-engine';
import { StorageService } from './storage.service';

export type CheckStatus = 'idle' | 'checking' | 'online' | 'offline';

interface Remote {
  /** The request this answer belongs to: an answer for an older medicine list / profile is ignored. */
  key: string;
  alerts: SafetyAlert[];
  identified: Set<string>;
}

const DEBOUNCE_MS = 350;

@Injectable({ providedIn: 'root' })
export class SafetyService {
  private meds = inject(MedicationService);
  private profile = inject(ProfileService);
  private store = inject(StorageService);
  private api = inject(ClinicalApiService);

  private acked = signal<string[]>(this.store.get<string[]>('acked', []));
  private remote = signal<Remote | null>(null);
  private nonce = signal(0);

  /** 'online' once the clinical database has answered for the CURRENT medicines and profile. */
  readonly status = signal<CheckStatus>('idle');

  /** What would be sent to the server for the current state. */
  private request = computed(() => {
    const active = this.meds.active();
    const patient = toApiPatient(this.profile.profile());
    return { active, medicines: toApiMedicines(active), patient, key: JSON.stringify({ m: toApiMedicines(active), p: patient }) };
  });

  /** Instant, offline answer from the small on-device rule set. */
  private local = computed<SafetyAlert[]>(() => analyze(this.meds.all(), this.profile.profile()));

  /**
   * Local rules always run. Once the clinical database has answered, its findings are added and the local
   * findings it supersedes (for medicines it recognised) are dropped. If the server is unreachable only the local
   * rules are shown, so the report degrades instead of disappearing.
   */
  readonly alerts = computed<SafetyAlert[]>(() => {
    const local = this.local();
    const r = this.remote();
    if (!r || r.key !== this.request().key) return local;
    const keep = local.filter((a) => {
      if (a.kind === 'unverified') return false; // the database reports what it could not check
      if (a.id.includes(':cls:')) return true; // same-class duplicates exist only in the local rules
      if (!DATABASE_KINDS.has(a.kind) || a.medIds.length === 0) return true;
      return !a.medIds.every((id) => r.identified.has(id));
    });
    return [...r.alerts, ...keep].sort((p, q) => SEVERITY_ORDER[p.severity] - SEVERITY_ORDER[q.severity]);
  });

  readonly counts = computed(() => summarize(this.alerts()));
  /** Major alerts the user has not yet dismissed with "I'll review with my doctor". */
  readonly pendingMajor = computed(() => this.alerts().filter((a) => a.severity === 'major' && !this.acked().includes(a.id)));

  constructor() {
    effect((onCleanup) => {
      this.nonce();
      const { active, medicines, patient, key } = this.request();
      if (active.length === 0) {
        this.remote.set(null);
        this.status.set('idle');
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => void this.refreshFrom(active, medicines, patient, key, ctrl.signal), DEBOUNCE_MS);
      this.status.set('checking');
      onCleanup(() => {
        clearTimeout(timer);
        ctrl.abort();
      });
    });
  }

  private async refreshFrom(
    active: Medication[],
    medicines: ApiMedicine[],
    patient: ApiPatient,
    key: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const res = await this.api.check(medicines, patient, signal);
      if (signal.aborted) return;
      this.remote.set({ key, alerts: toAlerts(res, active), identified: identifiedRefs(res) });
      this.status.set('online');
    } catch {
      if (signal.aborted) return;
      this.remote.set(null);
      this.status.set('offline');
    }
  }

  /** Ask the server again (e.g. after it was unreachable). */
  refresh(): void {
    this.nonce.update((n) => n + 1);
  }

  acknowledge(ids: string[]): void {
    const next = [...new Set([...this.acked(), ...ids])];
    this.acked.set(next);
    this.store.set('acked', next);
  }

  byId(id: string): SafetyAlert | undefined {
    return this.alerts().find((a) => a.id === id);
  }
}
