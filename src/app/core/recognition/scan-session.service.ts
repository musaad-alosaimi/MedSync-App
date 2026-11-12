import { Injectable, signal } from '@angular/core';
import { Detection } from './drug-matcher';
import { KbDrug } from '../safety/knowledge-base';

/** A candidate medicine in the post-scan confirmation step. */
export interface Candidate {
  /** KB id when recognised, else free text name. */
  drug?: KbDrug;
  name: string;
  selected: boolean;
}

/** Holds the result of the latest scan between the scan page and the review page. */
@Injectable({ providedIn: 'root' })
export class ScanSession {
  readonly imageUrl = signal<string | null>(null);
  readonly imageSize = signal<{ w: number; h: number } | null>(null);
  readonly detections = signal<Detection[]>([]);
  readonly candidates = signal<Candidate[]>([]);
  readonly demo = signal(false);

  reset(): void {
    const old = this.imageUrl();
    if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
    this.imageUrl.set(null);
    this.imageSize.set(null);
    this.detections.set([]);
    this.candidates.set([]);
    this.demo.set(false);
  }
}
