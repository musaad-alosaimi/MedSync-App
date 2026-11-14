import { EMPTY_PROFILE, HealthProfile, Medication } from '../models';
import { ClinicalResult, identifiedRefs, toAlerts, toApiMedicines, toApiPatient } from './clinical-mapper';

const profile = (p: Partial<HealthProfile> = {}): HealthProfile => ({ ...EMPTY_PROFILE, ...p });
const med = (id: string, name: string, over: Partial<Medication> = {}): Medication => ({
  id, name, dose: 1, form: 'pill', everyN: 1, everyUnit: 'day', startDate: '2026-11-01', time: '08:00',
  active: true, source: 'manual', createdAt: '2026-11-01T00:00:00Z', ...over,
});

const meds = [med('a', 'Brufen', { strength: '400mg' }), med('b', 'Aspirin'), med('c', 'Mystery')];
const pkg = (pkg_id: number, ref: string, status: 'identified' | 'unidentified' = 'identified') => ({
  pkg_id, ref, label: ref, brand: null, ingredients: status === 'identified' ? ['x'] : [], strengths: {}, status, notes: [],
});
const empty: ClinicalResult = { packages: [pkg(1, 'a'), pkg(2, 'b'), pkg(3, 'c', 'unidentified')], duplicates: [], interactions: [], no_record: [], not_assessable: [], patient: null };

describe('clinical mapper: app -> API', () => {
  it('maps profile ids to the words the database understands', () => {
    const p = toApiPatient(profile({ age: 72, sex: 'F', pregnant: true, chronic: ['stomach_ulcer', 'hypertension', 'custom:gout'], allergies: ['aspirin_nsaids', 'custom:lactose'] }));
    expect(p.conditions).toEqual(['peptic ulcer', 'high blood pressure', 'gout']);
    expect(p.allergies).toEqual(['aspirin', 'NSAIDs', 'lactose']);
    expect(p.pregnant).toBe(true);
  });

  it('never sends pregnancy for a non-female profile', () => {
    const p = toApiPatient(profile({ sex: 'M', pregnant: true, breastfeeding: true }));
    expect(p.pregnant).toBeNull();
    expect(p.breastfeeding).toBe(false);
  });

  it('sends the app id as ref and only includes strength when present', () => {
    expect(toApiMedicines(meds)).toEqual([{ ref: 'a', name: 'Brufen', strength: '400mg' }, { ref: 'b', name: 'Aspirin' }, { ref: 'c', name: 'Mystery' }]);
  });
});

describe('clinical mapper: API -> alerts', () => {
  it('maps an interaction to the two medicines with the database severity', () => {
    const res: ClinicalResult = { ...empty, interactions: [{ pkg_a: 1, pkg_b: 2, brand_a: 'x', brand_b: 'y', ingredient_a: 'ibuprofen', ingredient_b: 'aspirin', risk: 'Major' }] };
    const [a] = toAlerts(res, meds).filter((x) => x.kind === 'interaction');
    expect(a.severity).toBe('major');
    expect(a.medIds.sort()).toEqual(['a', 'b']);
    expect(a.origin).toBe('database');
    expect(a.message.en).toContain('Brufen');
  });

  it('shows an interaction with unspecified risk instead of hiding it, and says it is unspecified', () => {
    const res: ClinicalResult = { ...empty, interactions: [{ pkg_a: 1, pkg_b: 2, brand_a: 'x', brand_b: 'y', ingredient_a: 'a', ingredient_b: 'b', risk: 'Unknown' }] };
    const [a] = toAlerts(res, meds).filter((x) => x.kind === 'interaction');
    expect(a.severity).toBe('moderate');
    expect(a.message.en).toContain('does not state how serious');
  });

  it('maps CONTRAINDICATED patient findings to serious, with the database quote as evidence', () => {
    const res: ClinicalResult = {
      ...empty,
      patient: { alerts: [{ pkg_id: 1, brand: 'x', ingredient: 'ibuprofen', category: 'DISEASE', severity: 'CONTRAINDICATED', message: 'contraindication: Active GI bleeding', source_text: 'Active GI bleeding or ulcer', note: '' }], unmapped_conditions: [], unmapped_allergies: [], no_rules: [], notes: [] },
    };
    const [a] = toAlerts(res, meds).filter((x) => x.kind === 'condition');
    expect(a.severity).toBe('major');
    expect(a.medIds).toEqual(['a']);
    expect(a.evidence).toContain('Active GI bleeding');
  });

  it('reports unrecognised medicines and unscreened profile items as "not checked", never as safe', () => {
    const res: ClinicalResult = {
      ...empty,
      patient: { alerts: [], unmapped_conditions: ['high cholesterol'], unmapped_allergies: [], no_rules: [], notes: [] },
    };
    const un = toAlerts(res, meds).filter((x) => x.kind === 'unverified');
    expect(un.some((x) => x.medIds.includes('c'))).toBe(true);
    expect(un.some((x) => x.message.en.includes('high cholesterol'))).toBe(true);
  });

  it('gives a duplicate (same ingredient) as serious and ignores packages it cannot map back', () => {
    const res: ClinicalResult = {
      ...empty,
      duplicates: [
        { kind: 'duplicate', ingredient: 'ibuprofen', flag: '', packages: [{ pkg_id: 1, brand: 'x', strength: '' }, { pkg_id: 2, brand: 'y', strength: '' }], combined_single_dose_if_taken_together: '' },
        { kind: 'duplicate', ingredient: 'ghost', flag: '', packages: [{ pkg_id: 8, brand: 'x', strength: '' }, { pkg_id: 9, brand: 'y', strength: '' }], combined_single_dose_if_taken_together: '' },
      ],
    };
    const d = toAlerts(res, meds).filter((x) => x.kind === 'duplicate');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('major');
  });

  it('lists the medicines the database identified', () => {
    expect([...identifiedRefs(empty)].sort()).toEqual(['a', 'b']);
  });
});
