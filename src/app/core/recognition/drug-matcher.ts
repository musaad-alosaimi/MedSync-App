import { BRANDS, DRUGS, KbDrug, findDrug } from '../safety/knowledge-base';

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface Detection {
  drug: KbDrug;
  boxes: OcrWord['bbox'][];
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Single-token keys (ingredient names + brands) with enough letters to be matched safely. */
const KEY_INDEX: { key: string; drugs: KbDrug[] }[] = [
  ...DRUGS.flatMap((drug) =>
    [...new Set(drug.keys)].filter((k) => /^[a-z0-9]+$/.test(k) && k.length >= 4).map((key) => ({ key, drugs: [drug] })),
  ),
  ...Object.entries(BRANDS).map(([key, ids]) => ({ key, drugs: ids.map((id) => findDrug(id)!).filter(Boolean) })),
];

function matchToken(token: string): KbDrug[] {
  if (token.length < 4) return [];
  let best: { drugs: KbDrug[]; dist: number } | undefined;
  for (const { key, drugs } of KEY_INDEX) {
    let dist: number;
    if (token === key) dist = 0;
    else if (key.length >= 7 && token.length >= 6) {
      const allowed = key.length >= 11 ? 2 : 1;
      dist = levenshtein(token, key, allowed);
      if (dist > allowed) continue;
    } else continue;
    if (!best || dist < best.dist) best = { drugs, dist };
  }
  return best?.drugs ?? [];
}

/**
 * Turn OCR words into medicine detections.
 * Words are split on non-letters ("Amlodipine/Valsartan" -> two tokens) and compared
 * to known names, brand names and ingredient names, tolerating 1–2 OCR errors on long names.
 */
export function detectDrugs(words: OcrWord[]): Detection[] {
  const found = new Map<string, Detection>();
  for (const w of words) {
    const tokens = w.text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const t of tokens) {
      for (const drug of matchToken(t)) {
        const det = found.get(drug.id) ?? { drug, boxes: [] };
        det.boxes.push(w.bbox);
        found.set(drug.id, det);
      }
    }
  }
  return [...found.values()];
}
