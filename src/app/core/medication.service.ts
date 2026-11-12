import { Injectable, computed, inject, signal } from '@angular/core';
import { Medication } from './models';
import { StorageService } from './storage.service';

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class MedicationService {
  private store = inject(StorageService);
  private _meds = signal<Medication[]>(this.store.get<Medication[]>('meds', []));

  readonly all = this._meds.asReadonly();
  readonly active = computed(() => this._meds().filter((m) => m.active));
  readonly inactive = computed(() => this._meds().filter((m) => !m.active));

  private commit(list: Medication[]) {
    this._meds.set(list);
    this.store.set('meds', list);
  }

  get(id: string): Medication | undefined {
    return this._meds().find((m) => m.id === id);
  }

  add(m: Omit<Medication, 'id' | 'createdAt'>): Medication {
    const med: Medication = { ...m, id: newId(), createdAt: new Date().toISOString() };
    this.commit([med, ...this._meds()]);
    return med;
  }

  addMany(items: Omit<Medication, 'id' | 'createdAt'>[]): Medication[] {
    const created = items.map((m) => ({ ...m, id: newId(), createdAt: new Date().toISOString() }));
    this.commit([...created, ...this._meds()]);
    return created;
  }

  update(id: string, patch: Partial<Medication>): void {
    this.commit(this._meds().map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  setActive(id: string, active: boolean): void {
    this.update(id, { active });
  }

  remove(id: string): void {
    this.commit(this._meds().filter((m) => m.id !== id));
  }

  clear(): void {
    this.commit([]);
  }
}
