import { detectDrugs, levenshtein } from './drug-matcher';

const w = (text: string, i = 0) => ({ text, bbox: { x0: i, y0: 0, x1: i + 10, y1: 10 } });

describe('drug matcher', () => {
  it('computes edit distance', () => {
    expect(levenshtein('valsartan', 'valsartan')).toBe(0);
    expect(levenshtein('valsartan', 'valsartam')).toBe(1);
  });

  it('detects exact names, split tokens and brand names', () => {
    const r = detectDrugs([w('Amlodipine/Valsartan'), w('Glucophage'), w('Hydrochlorothiazide')]);
    expect(r.map((d) => d.drug.id).sort()).toEqual(['amlodipine', 'hydrochlorothiazide', 'metformin', 'valsartan']);
  });

  it('tolerates small OCR errors on long names only', () => {
    expect(detectDrugs([w('Va1sartan')]).map((d) => d.drug.id)).toEqual(['valsartan']);
    expect(detectDrugs([w('Hydrochlorothiazlde')]).map((d) => d.drug.id)).toEqual(['hydrochlorothiazide']);
    // short/ambiguous words must not match
    expect(detectDrugs([w('Plus'), w('film'), w('tablets'), w('Pharma')])).toEqual([]);
  });

  it('maps regional brand names to their shared ingredients', () => {
    const r = detectDrugs([w('Anglosar'), w('CO-ANGINET'), w('EXFORGE')]);
    expect(r.map((d) => d.drug.id).sort()).toEqual(['amlodipine', 'hydrochlorothiazide', 'valsartan']);
  });

  it('merges multiple boxes for the same medicine', () => {
    const r = detectDrugs([w('Valsartan', 0), w('valsartan', 50)]);
    expect(r).toHaveLength(1);
    expect(r[0].boxes).toHaveLength(2);
  });
});
