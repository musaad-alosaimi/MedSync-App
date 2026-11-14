import { Bi, HealthProfile, Medication, SafetyAlert, Severity } from '../models';
import { ADVICE } from '../safety/knowledge-base';

// ---------------------------------------------------------------------------
// Wire types: the JSON returned by server/app.py (shaped by interaction_checker.py / patient_screen.py)
// ---------------------------------------------------------------------------

export interface ApiPatient {
  age: number | null;
  sex: 'F' | 'M' | null;
  pregnant: boolean | null;
  breastfeeding: boolean;
  conditions: string[];
  allergies: string[];
}

export interface ApiMedicine {
  ref: string;
  name: string;
  strength?: string;
}

export interface ApiPackage {
  pkg_id: number;
  ref?: string;
  label: string;
  brand: string | null;
  ingredients: string[];
  strengths: Record<string, string>;
  status: 'identified' | 'unidentified';
  notes: string[];
  /** What the vision model read on the pack (only for photos read by the vision model). */
  vision?: { brand: string | null; ingredients: string[]; strength: string | null; legibility: 'clear' | 'partial' | 'guess'; low_trust?: boolean };
  /** Which reader produced this package. */
  source?: 'ocr' | 'vision';
}

export interface ApiInteraction {
  pkg_a: number;
  pkg_b: number;
  brand_a: string;
  brand_b: string;
  ingredient_a: string;
  ingredient_b: string;
  risk: 'Major' | 'Moderate' | 'Minor' | 'Unknown';
  db_entries?: { drug_a: string; drug_b: string; risk: string }[];
}

export interface ApiDuplicate {
  kind: 'duplicate' | 'related';
  ingredient: string;
  flag: string;
  packages: { pkg_id: number; brand: string; strength: string }[];
  combined_single_dose_if_taken_together: string;
}

export interface ApiPatientAlert {
  pkg_id: number;
  brand: string;
  ingredient: string;
  category: 'ALLERGY' | 'DISEASE' | 'AGE' | 'PREGNANCY' | 'EXCIPIENT';
  severity: 'CONTRAINDICATED' | 'WARNING' | 'PRECAUTION' | 'CHECK';
  message: string;
  source_text: string;
  note: string;
}

export interface ApiPairRow {
  pkg_a: number;
  pkg_b: number;
  brand_a: string;
  brand_b: string;
}

export interface ClinicalResult {
  packages: ApiPackage[];
  duplicates: ApiDuplicate[];
  interactions: ApiInteraction[];
  no_record: ApiPairRow[];
  not_assessable: ApiPairRow[];
  patient: {
    alerts: ApiPatientAlert[];
    unmapped_conditions: string[];
    unmapped_allergies: string[];
    no_rules: string[];
    notes: string[];
  } | null;
}

// ---------------------------------------------------------------------------
// App -> API
// ---------------------------------------------------------------------------

/** How the clinical database words each of the app's chronic-condition ids (see patient_screen.CONDITIONS). */
const CONDITION_TEXT: Record<string, string> = {
  hypertension: 'high blood pressure',
  diabetes: 'diabetes',
  kidney_disease: 'kidney disease',
  heart_disease: 'cardiovascular disease',
  heart_failure: 'heart failure',
  asthma: 'asthma',
  liver_disease: 'liver disease',
  stomach_ulcer: 'peptic ulcer',
  high_cholesterol: 'high cholesterol',
  thyroid_disease: 'thyroid disease',
};

const ALLERGY_TEXT: Record<string, string[]> = {
  penicillin: ['penicillin'],
  aspirin_nsaids: ['aspirin', 'NSAIDs'],
  sulfa: ['sulfa'],
};

export function toApiPatient(p: HealthProfile): ApiPatient {
  const custom = (id: string) => id.slice('custom:'.length).trim();
  return {
    age: p.age,
    sex: p.sex,
    // pregnancy only makes sense for women; never send a stale value after a sex change
    pregnant: p.sex === 'F' ? p.pregnant : null,
    breastfeeding: p.sex === 'F' && p.breastfeeding,
    conditions: p.chronic.flatMap((id) => (id.startsWith('custom:') ? [custom(id)] : CONDITION_TEXT[id] ? [CONDITION_TEXT[id]] : [])).filter(Boolean),
    allergies: p.allergies.flatMap((id) => (id.startsWith('custom:') ? [custom(id)] : (ALLERGY_TEXT[id] ?? []))).filter(Boolean),
  };
}

export function toApiMedicines(meds: Medication[]): ApiMedicine[] {
  return meds.map((m) => ({ ref: m.id, name: m.name, ...(m.strength ? { strength: m.strength } : {}) }));
}

// ---------------------------------------------------------------------------
// API -> app alerts
// ---------------------------------------------------------------------------

/** Isolate Latin text inside an Arabic sentence so punctuation does not reorder around it. */
const iso = (s: string) => `⁨${s}⁩`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const RISK_SEVERITY: Record<ApiInteraction['risk'], Severity> = { Major: 'major', Moderate: 'moderate', Minor: 'minor', Unknown: 'moderate' };
const RISK_AR: Record<ApiInteraction['risk'], string> = { Major: 'خطير', Moderate: 'متوسط', Minor: 'قليل', Unknown: 'غير محدد الخطورة' };

/** CONTRAINDICATED is the database's strongest statement -> serious. */
const PATIENT_SEVERITY: Record<ApiPatientAlert['severity'], Severity> = {
  CONTRAINDICATED: 'major',
  WARNING: 'moderate',
  PRECAUTION: 'minor',
  CHECK: 'minor',
};

const PATIENT_KIND: Record<ApiPatientAlert['category'], SafetyAlert['kind']> = {
  DISEASE: 'condition',
  AGE: 'age',
  ALLERGY: 'allergy',
  PREGNANCY: 'pregnancy',
  EXCIPIENT: 'excipient',
};

const PATIENT_TITLE: Record<ApiPatientAlert['category'], Record<ApiPatientAlert['severity'], Bi>> = {
  DISEASE: {
    CONTRAINDICATED: { en: 'Should not be used with your health condition', ar: 'لا يجب استخدامه مع حالتك الصحية' },
    WARNING: { en: 'Use with caution with your health condition', ar: 'يُستخدم بحذر مع حالتك الصحية' },
    PRECAUTION: { en: 'Precaution for your health condition', ar: 'تنبيه يخص حالتك الصحية' },
    CHECK: { en: 'Check with your doctor about your health condition', ar: 'اسأل طبيبك عن حالتك الصحية' },
  },
  AGE: {
    CONTRAINDICATED: { en: 'Not recommended at your age', ar: 'غير مناسب لعمرك' },
    WARNING: { en: 'Extra risk at your age', ar: 'خطر إضافي في عمرك' },
    PRECAUTION: { en: 'Age precaution', ar: 'تنبيه يخص العمر' },
    CHECK: { en: 'Check suitability for your age', ar: 'تأكد من ملاءمته لعمرك' },
  },
  ALLERGY: {
    CONTRAINDICATED: { en: 'Conflicts with your allergy', ar: 'يتعارض مع حساسيتك' },
    WARNING: { en: 'May conflict with your allergy', ar: 'قد يتعارض مع حساسيتك' },
    PRECAUTION: { en: 'Possible cross-reaction with your allergy', ar: 'احتمال تفاعل متصالب مع حساسيتك' },
    CHECK: { en: 'Check against your allergy', ar: 'تحقق من توافقه مع حساسيتك' },
  },
  PREGNANCY: {
    CONTRAINDICATED: { en: 'Should not be used in pregnancy or breastfeeding', ar: 'لا يجب استخدامه أثناء الحمل أو الرضاعة' },
    WARNING: { en: 'Pregnancy / breastfeeding warning', ar: 'تحذير بخصوص الحمل أو الرضاعة' },
    PRECAUTION: { en: 'Pregnancy / breastfeeding precaution', ar: 'تنبيه بخصوص الحمل أو الرضاعة' },
    CHECK: { en: 'Tell your doctor if you are or may be pregnant', ar: 'أخبر طبيبك إن كنتِ حاملاً أو قد تكونين كذلك' },
  },
  EXCIPIENT: {
    CONTRAINDICATED: { en: 'Contains an ingredient you are sensitive to', ar: 'يحتوي على مكوّن لديك حساسية منه' },
    WARNING: { en: 'May contain an ingredient you are sensitive to', ar: 'قد يحتوي على مكوّن لديك حساسية منه' },
    PRECAUTION: { en: 'Ingredient sensitivity', ar: 'حساسية من مكوّن' },
    CHECK: { en: 'Check the ingredients list', ar: 'راجع قائمة المكوّنات' },
  },
};

const sortedKey = (ids: string[]) => [...ids].sort().join('+');

interface MapContext {
  /** server pkg_id -> the app's medication id */
  refOf: Map<number, string>;
  /** server pkg_id -> medicine name as the user knows it */
  nameOf: Map<number, string>;
}

function context(res: ClinicalResult, meds: Medication[]): MapContext {
  const byId = new Map(meds.map((m) => [m.id, m]));
  const refOf = new Map<number, string>();
  const nameOf = new Map<number, string>();
  for (const p of res.packages) {
    if (!p.ref || !byId.has(p.ref)) continue;
    refOf.set(p.pkg_id, p.ref);
    nameOf.set(p.pkg_id, byId.get(p.ref)!.name);
  }
  return { refOf, nameOf };
}

/**
 * Convert the clinical API result into the app's SafetyAlert list.
 * Message text from the database is English; the surrounding sentence is bilingual.
 */
export function toAlerts(res: ClinicalResult, meds: Medication[]): SafetyAlert[] {
  const { refOf, nameOf } = context(res, meds);
  const alerts: SafetyAlert[] = [];
  const name = (pkg: number) => nameOf.get(pkg) ?? String(pkg);

  // Interactions ------------------------------------------------------------
  const seen = new Set<string>();
  for (const r of res.interactions) {
    const a = refOf.get(r.pkg_a);
    const b = refOf.get(r.pkg_b);
    if (!a || !b) continue;
    const severity = RISK_SEVERITY[r.risk];
    const A = name(r.pkg_a);
    const B = name(r.pkg_b);
    const ingA = cap(r.ingredient_a);
    const ingB = cap(r.ingredient_b);
    const specified = r.risk !== 'Unknown';
    const id = `db:interaction:${sortedKey([a, b])}:${[r.ingredient_a, r.ingredient_b].sort().join('+')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push({
      id,
      severity,
      kind: 'interaction',
      medIds: [a, b],
      origin: 'database',
      title: specified
        ? { en: `${r.risk} interaction`, ar: `تفاعل دوائي ${RISK_AR[r.risk]}` }
        : { en: 'Interaction listed (severity not specified)', ar: 'تفاعل دوائي مُسجَّل (الخطورة غير محددة)' },
      message: {
        en: `${A} and ${B} interact (${ingA} + ${ingB}). ${specified ? `The database rates this as ${r.risk.toLowerCase()}.` : 'The database lists this combination but does not state how serious it is.'}`,
        ar: `يوجد تفاعل بين ${iso(A)} و${iso(B)} (${iso(ingA)} + ${iso(ingB)}). ${specified ? `تصنّفه قاعدة البيانات على أنه ${RISK_AR[r.risk]}.` : 'تذكر قاعدة البيانات هذا الدمج دون تحديد مدى خطورته.'}`,
      },
      advice: specified
        ? ADVICE[severity]
        : {
            en: 'The seriousness is not specified, so ask your pharmacist or doctor whether these two can be taken together.',
            ar: 'مدى الخطورة غير محدد، لذا اسأل الصيدلي أو الطبيب هل يمكن تناول الدوائين معاً.',
          },
    });
  }

  // Duplicates --------------------------------------------------------------
  for (const d of res.duplicates) {
    const ids = d.packages.map((p) => refOf.get(p.pkg_id)).filter((x): x is string => !!x);
    if (ids.length < 2) continue;
    const names = d.packages.map((p) => name(p.pkg_id));
    const ing = cap(d.ingredient);
    const same = d.kind === 'duplicate';
    const combined = d.combined_single_dose_if_taken_together;
    alerts.push({
      id: `db:duplicate:${sortedKey(ids)}:${d.ingredient}`,
      severity: same ? 'major' : 'moderate',
      kind: 'duplicate',
      medIds: ids,
      origin: 'database',
      title: same ? { en: 'Same active ingredient twice', ar: 'نفس المادة الفعّالة مرتين' } : { en: 'Possible duplicate therapy', ar: 'احتمال ازدواج في العلاج' },
      message: same
        ? {
            en: `${names.join(' and ')} both contain ${ing}. Taking them together can mean an overdose.${combined ? ` Together that is ${combined} per dose.` : ''}`,
            ar: `يحتوي ${names.map(iso).join(' و')} على ${iso(ing)}. تناولهما معاً قد يعني جرعة زائدة.${combined ? ` المجموع ${iso(combined)} في الجرعة الواحدة.` : ''}`,
          }
        : {
            en: `${names.join(' and ')} are filed under the same active ingredient (${ing}) and may do the same job.`,
            ar: `${names.map(iso).join(' و')} مصنّفة تحت نفس المادة الفعّالة (${iso(ing)}) وقد تؤدي نفس الغرض.`,
          },
      advice: ADVICE[same ? 'major' : 'moderate'],
    });
  }

  // Patient screen (age / sex / pregnancy / disease / allergy / excipient) --------
  const seenPatient = new Set<string>();
  for (const a of res.patient?.alerts ?? []) {
    const id = refOf.get(a.pkg_id);
    if (!id) continue;
    const severity = PATIENT_SEVERITY[a.severity];
    const key = `${a.category}:${a.source_text}:${a.message}`;
    const alertId = `db:${PATIENT_KIND[a.category]}:${id}:${hash(key)}`;
    if (seenPatient.has(alertId)) continue;
    seenPatient.add(alertId);
    const med = name(a.pkg_id);
    alerts.push({
      id: alertId,
      severity,
      kind: PATIENT_KIND[a.category],
      medIds: [id],
      origin: 'database',
      title: PATIENT_TITLE[a.category][a.severity],
      message: {
        en: `${med} (${cap(a.ingredient)}): ${a.message}`,
        ar: `${iso(med)} (${iso(cap(a.ingredient))}): ${iso(a.message)}`,
      },
      advice: ADVICE[severity],
      evidence: [a.source_text, a.note].filter(Boolean).join(' — '),
    });
  }

  // Things the database could not check: say so, never imply "safe" -------------------
  const unidentified = res.packages.filter((p) => p.status === 'unidentified' && p.ref && refOf.has(p.pkg_id));
  if (unidentified.length) {
    const ids = unidentified.map((p) => p.ref!);
    const names = unidentified.map((p) => name(p.pkg_id));
    alerts.push({
      id: `db:unverified:${sortedKey(ids)}:unidentified`,
      severity: 'minor',
      kind: 'unverified',
      medIds: ids,
      origin: 'database',
      title: { en: 'Not recognised by the clinical database', ar: 'غير معروف في قاعدة البيانات الطبية' },
      message: {
        en: `${names.join(', ')} could not be matched to a known medicine, so it was not checked for interactions. This does not mean it is safe.`,
        ar: `تعذّر التعرّف على ${names.map(iso).join('، ')} ضمن الأدوية المعروفة، لذا لم يُفحص للتفاعلات. هذا لا يعني أنه آمن.`,
      },
      advice: { en: 'Ask your pharmacist to check it against your other medicines.', ar: 'اطلب من الصيدلي مراجعته مع باقي أدويتك.' },
    });
  }
  if (res.not_assessable.length) {
    const ids = [...new Set(res.not_assessable.flatMap((r) => [refOf.get(r.pkg_a), refOf.get(r.pkg_b)]).filter((x): x is string => !!x))];
    const pairs = res.not_assessable.map((r) => `${name(r.pkg_a)} + ${name(r.pkg_b)}`);
    if (ids.length) {
      alerts.push({
        id: `db:unverified:${sortedKey(ids)}:pairs`,
        severity: 'minor',
        kind: 'unverified',
        medIds: ids,
        origin: 'database',
        title: { en: 'Some combinations could not be assessed', ar: 'تعذّر تقييم بعض الدمج الدوائي' },
        message: {
          en: `The database has no complete interaction list for these combinations, so they could not be checked: ${pairs.join('; ')}. This does not mean they are safe.`,
          ar: `لا تملك قاعدة البيانات قائمة تفاعلات كاملة لهذه الدمجات فلم تُفحص: ${pairs.map(iso).join('؛ ')}. هذا لا يعني أنها آمنة.`,
        },
        advice: { en: 'Ask your pharmacist about these combinations.', ar: 'اسأل الصيدلي عن هذه الدمجات.' },
      });
    }
  }
  const skipped = [...(res.patient?.unmapped_conditions ?? []), ...(res.patient?.unmapped_allergies ?? [])];
  if (skipped.length) {
    alerts.push({
      id: `db:unverified::profile:${hash(skipped.join('|'))}`,
      severity: 'minor',
      kind: 'unverified',
      medIds: [],
      origin: 'database',
      title: { en: 'Part of your health profile was not screened', ar: 'جزء من ملفك الصحي لم يُفحص' },
      message: {
        en: `The clinical database has no rules for: ${skipped.join(', ')}. Medicines were not checked against these.`,
        ar: `لا تملك قاعدة البيانات قواعد بخصوص: ${skipped.map(iso).join('، ')}. لم تُفحص الأدوية مقابلها.`,
      },
      advice: { en: 'Mention these to your doctor or pharmacist.', ar: 'اذكرها لطبيبك أو الصيدلي.' },
    });
  }
  return alerts;
}

/** Medication ids that the server identified (status 'identified'): its findings are authoritative for these. */
export function identifiedRefs(res: ClinicalResult): Set<string> {
  return new Set(res.packages.filter((p) => p.status === 'identified' && p.ref).map((p) => p.ref!));
}

/** Kinds the clinical database decides for medicines it recognises (the on-device rule for these is then redundant). */
export const DATABASE_KINDS: ReadonlySet<SafetyAlert['kind']> = new Set(['duplicate', 'interaction', 'age', 'condition', 'allergy']);

/** Small stable string hash for ids. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
