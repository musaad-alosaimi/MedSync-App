import { EMPTY_PROFILE, HealthProfile, Medication } from '../models';
import { analyze } from './safety-engine';
import { DRUGS, findDrug, resolveName, searchDrugs } from './knowledge-base';

let n = 0;
function med(kbId: string, over: Partial<Medication> = {}): Medication {
  const kb = findDrug(kbId);
  return {
    id: `m${++n}`,
    name: kb?.en ?? kbId,
    kbId: kb?.id,
    dose: 1,
    form: 'pill',
    everyN: 1,
    everyUnit: 'day',
    startDate: '2026-11-01',
    time: '08:00',
    active: true,
    source: 'manual',
    createdAt: '2026-11-01T00:00:00Z',
    ...over,
  };
}
const profile = (p: Partial<HealthProfile> = {}): HealthProfile => ({ ...EMPTY_PROFILE, ...p });
const today = new Date('2026-11-11T12:00:00');

describe('safety engine', () => {
  it('returns nothing for a single safe medicine', () => {
    expect(analyze([med('amlodipine')], profile({ age: 40 }), today)).toEqual([]);
  });

  it('flags ACE inhibitor + ARB as a major interaction', () => {
    const a = analyze([med('captopril'), med('valsartan')], profile(), today);
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('major');
    expect(a[0].kind).toBe('interaction');
    expect(a[0].message.en).toContain('Captopril');
    expect(a[0].message.ar).toContain('Valsartan');
  });

  it('flags warfarin + aspirin as major bleeding risk (one alert per pair)', () => {
    const a = analyze([med('warfarin'), med('aspirin')], profile(), today);
    expect(a.filter((x) => x.kind === 'interaction')).toHaveLength(1);
    expect(a[0].severity).toBe('major');
  });

  it('flags the same ingredient twice as a duplicate', () => {
    const a = analyze([med('metformin'), med('metformin')], profile(), today);
    expect(a.some((x) => x.kind === 'duplicate' && x.severity === 'major')).toBe(true);
  });

  it('flags two drugs of the same class when no specific rule exists', () => {
    const a = analyze([med('atorvastatin'), med('simvastatin')], profile(), today);
    expect(a.some((x) => x.kind === 'duplicate' && x.severity === 'moderate')).toBe(true);
  });

  it('ignores inactive medicines', () => {
    const a = analyze([med('warfarin'), med('aspirin', { active: false })], profile(), today);
    expect(a).toEqual([]);
  });

  it('applies age rules', () => {
    const old = analyze([med('ibuprofen')], profile({ age: 72 }), today);
    expect(old.some((x) => x.kind === 'age')).toBe(true);
    const young = analyze([med('ibuprofen')], profile({ age: 30 }), today);
    expect(young.some((x) => x.kind === 'age')).toBe(false);
    const child = analyze([med('aspirin')], profile({ age: 10 }), today);
    expect(child.find((x) => x.kind === 'age')?.severity).toBe('major');
  });

  it('applies chronic-condition rules and keeps the worst severity per drug', () => {
    const a = analyze([med('ibuprofen')], profile({ chronic: ['kidney_disease', 'hypertension'] }), today);
    const cond = a.filter((x) => x.kind === 'condition');
    expect(cond).toHaveLength(2);
    expect(cond[0].severity).toBe('major');
  });

  it('applies allergy rules', () => {
    const a = analyze([med('amoxicillin')], profile({ allergies: ['penicillin'] }), today);
    expect(a[0].kind).toBe('allergy');
    expect(a[0].severity).toBe('major');
    const custom = analyze([med('ibuprofen')], profile({ allergies: ['custom:ibuprofen'] }), today);
    expect(custom.some((x) => x.kind === 'allergy')).toBe(true);
  });

  it('flags long-term use from the start date', () => {
    const a = analyze([med('omeprazole', { startDate: '2026-06-01' })], profile(), today);
    expect(a.some((x) => x.kind === 'longterm')).toBe(true);
    const fresh = analyze([med('omeprazole', { startDate: '2026-11-01' })], profile(), today);
    expect(fresh.some((x) => x.kind === 'longterm')).toBe(false);
  });

  it('adds a polypharmacy note at 5+ medicines and marks unknown medicines as unchecked', () => {
    const list = [med('amlodipine'), med('vitamin_d'), med('folic_acid'), med('levothyroxine'), med('paracetamol'), med('x', { kbId: undefined, name: 'Mystery' })];
    const a = analyze(list, profile(), today);
    expect(a.some((x) => x.kind === 'polypharmacy')).toBe(true);
    expect(a.some((x) => x.kind === 'unverified')).toBe(true);
  });

  it('sorts alerts by severity', () => {
    const a = analyze([med('metformin'), med('aspirin'), med('captopril'), med('valsartan')], profile(), today);
    const sevs = a.map((x) => x.severity);
    expect(sevs).toEqual([...sevs].sort((p, q) => ['major', 'moderate', 'minor'].indexOf(p) - ['major', 'moderate', 'minor'].indexOf(q)));
  });
});

describe('knowledge base', () => {
  it('has unique ids and resolves names', () => {
    expect(new Set(DRUGS.map((d) => d.id)).size).toBe(DRUGS.length);
    expect(resolveName('metformin')?.id).toBe('metformin');
    expect(resolveName('ميتفورمين')?.id).toBe('metformin');
    expect(resolveName('Glucophage')?.id).toBe('metformin');
    expect(resolveName('zzz')).toBeUndefined();
  });

  it('searches by prefix first', () => {
    const r = searchDrugs('met');
    expect(r[0].en.toLowerCase().startsWith('met')).toBe(true);
    expect(r.map((x) => x.id)).toContain('metformin');
  });
});
