import { Injectable } from '@angular/core';
import { DRUGS, KbDrug } from '../safety/knowledge-base';
import { Detection, OcrWord, detectDrugs } from './drug-matcher';

export interface RecognitionResult {
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

const TARGET_SIDE = 1800;
const MAX_UPSCALE = 3;

/** Draw the image to a canvas around TARGET_SIDE px: shrinks huge photos, enlarges small ones (small print needs pixels). */
async function toCanvas(src: Blob | string): Promise<HTMLCanvasElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('image'));
    img.src = url;
  });
  if (typeof src !== 'string') URL.revokeObjectURL(url);
  const scale = Math.min(MAX_UPSCALE, TARGET_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * Reads medicine names from a photo using on-device OCR (Tesseract.js) and matches
 * them against the knowledge base. The OCR engine and English language data are
 * downloaded on first use, so a connection is needed the first time.
 *
 * To upgrade accuracy (brand names, Arabic labels, dosage strength) replace `identify`
 * with a call to a server-side vision model — the rest of the app only depends on RecognitionResult.
 */
@Injectable({ providedIn: 'root' })
export class RecognitionService {
  private workerPromise?: Promise<import('tesseract.js').Worker>;

  private async worker() {
    this.workerPromise ??= import('tesseract.js').then(async (m) => {
      const w = await m.createWorker('eng');
      // Sparse-text mode finds scattered labels on shelves/boxes better than page mode.
      await w.setParameters({ tessedit_pageseg_mode: '11' as never });
      return w;
    });
    return this.workerPromise;
  }

  async identify(src: Blob | string): Promise<RecognitionResult> {
    const canvas = await toCanvas(src);
    let words: OcrWord[] = [];
    try {
      const worker = await this.worker();
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, bbox: w.bbox })))));
    } catch (e) {
      this.workerPromise = undefined;
      throw e;
    }
    return { detections: detectDrugs(words), imageWidth: canvas.width, imageHeight: canvas.height };
  }

  /** A fixed set of well-known medicines used to demo the flow without a camera. */
  demoSet(): KbDrug[] {
    const ids = ['metformin', 'aspirin', 'captopril', 'valsartan', 'vitamin_b12'];
    return ids.map((id) => DRUGS.find((d) => d.id === id)!);
  }
}
