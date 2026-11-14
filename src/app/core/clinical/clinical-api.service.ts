import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ApiMedicine, ApiPackage, ApiPatient, ClinicalResult } from './clinical-mapper';

export interface ScanApiResult extends ClinicalResult {
  /** PNG of the photo with every package outlined, as base64 (only when requested). */
  annotated_png_base64?: string;
  /** Which reader produced the packages: OpenCV + Tesseract, the vision-model fallback, or both. */
  engine?: 'vision' | 'ocr' | 'ocr+vision';
  packages: ApiPackage[];
}

/** Thrown for any failure to get an answer from the clinical API (offline, server down, bad response). */
export class ClinicalApiError extends Error {}

const CHECK_TIMEOUT_MS = 15_000;
const SCAN_TIMEOUT_MS = 120_000;

/** Client for the Python clinical API (server/app.py). Every call can fail: callers must have a fallback. */
@Injectable({ providedIn: 'root' })
export class ClinicalApiService {
  private base = environment.apiUrl.replace(/\/+$/, '');

  private async request<T>(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetch(this.base + path, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) throw new ClinicalApiError(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (signal?.aborted) throw e; // caller cancelled: not an error to report
      throw e instanceof ClinicalApiError ? e : new ClinicalApiError(e instanceof Error ? e.message : 'network');
    }
  }

  /** Check typed / saved medicines (names) against each other and the patient profile. */
  check(medicines: ApiMedicine[], patient: ApiPatient, signal?: AbortSignal): Promise<ClinicalResult> {
    return this.request<ClinicalResult>(
      '/api/check',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ medicines, patient }) },
      CHECK_TIMEOUT_MS,
      signal,
    );
  }

  /** Read the medicine packages in a photo (server-side segmentation + OCR) and check them. */
  scan(image: Blob, patient: ApiPatient): Promise<ScanApiResult> {
    const form = new FormData();
    form.append('image', image, 'photo.jpg');
    form.append('patient', JSON.stringify(patient));
    form.append('annotate', 'true');
    return this.request<ScanApiResult>('/api/scan', { method: 'POST', body: form }, SCAN_TIMEOUT_MS);
  }
}
