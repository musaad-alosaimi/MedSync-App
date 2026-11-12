import { Bi, MedForm, Severity } from '../models';

/**
 * Illustrative medication knowledge base used by the on-device safety engine.
 * It is intentionally small and rule-based so every statement is reviewable.
 * For production, replace with a licensed/clinically-governed source
 * (e.g. SFDA drug registry + a curated interaction database) and have it
 * reviewed by a clinical pharmacist.
 */

export interface KbDrug {
  id: string;
  en: string;
  ar: string;
  kind: 'drug' | 'supplement';
  /** Therapeutic class used for duplicate-therapy detection. */
  cls?: string;
  /** Tokens used by rules (always includes id and cls). */
  tags: string[];
  defaultForm: MedForm;
  /** Lower-case brand / ingredient keys used for search and OCR matching. */
  keys: string[];
}

function d(
  id: string,
  en: string,
  ar: string,
  kind: 'drug' | 'supplement',
  cls: string | undefined,
  extraTags: string[],
  defaultForm: MedForm,
  keys: string[],
): KbDrug {
  const tags = [id, ...(cls ? [cls] : []), ...extraTags];
  return { id, en, ar, kind, cls, tags: [...new Set(tags)], defaultForm, keys: [id.replace(/_/g, ''), ...keys] };
}

export const DRUGS: KbDrug[] = [
  // --- diabetes
  d('metformin', 'Metformin', 'ميتفورمين', 'drug', 'biguanide', [], 'pill', ['metformin', 'glucophage', 'glucomet']),
  d('gliclazide', 'Gliclazide', 'جليكلازايد', 'drug', 'sulfonylurea', [], 'pill', ['gliclazide', 'diamicron']),
  d('glimepiride', 'Glimepiride', 'جليميبرايد', 'drug', 'sulfonylurea', [], 'pill', ['glimepiride', 'amaryl']),
  d('insulin', 'Insulin', 'إنسولين', 'drug', 'insulin', [], 'injection', ['insulin', 'lantus', 'novorapid', 'mixtard']),
  // --- pain / antiplatelet / anticoagulant
  d('aspirin', 'Aspirin', 'أسبرين', 'drug', 'nsaid', ['antiplatelet'], 'pill', ['aspirin', 'acetylsalicylic', 'cardiprin']),
  d('ibuprofen', 'Ibuprofen', 'إيبوبروفين', 'drug', 'nsaid', ['nsaid_other'], 'pill', ['ibuprofen', 'brufen', 'advil', 'nurofen']),
  d('naproxen', 'Naproxen', 'نابروكسين', 'drug', 'nsaid', ['nsaid_other'], 'pill', ['naproxen', 'naprosyn']),
  d('diclofenac', 'Diclofenac', 'ديكلوفيناك', 'drug', 'nsaid', ['nsaid_other'], 'pill', ['diclofenac', 'voltaren', 'cataflam', 'olfen']),
  d('paracetamol', 'Paracetamol', 'باراسيتامول', 'drug', 'analgesic', [], 'pill', ['paracetamol', 'acetaminophen', 'panadol', 'tylenol']),
  d('warfarin', 'Warfarin', 'وارفارين', 'drug', 'anticoagulant', [], 'pill', ['warfarin', 'coumadin', 'marevan']),
  d('clopidogrel', 'Clopidogrel', 'كلوبيدوغريل', 'drug', 'antiplatelet', [], 'pill', ['clopidogrel', 'plavix']),
  // --- heart / blood pressure
  d('captopril', 'Captopril', 'كابتوبريل', 'drug', 'acei', [], 'pill', ['captopril', 'capoten']),
  d('lisinopril', 'Lisinopril', 'ليزينوبريل', 'drug', 'acei', [], 'pill', ['lisinopril', 'zestril', 'prinivil']),
  d('enalapril', 'Enalapril', 'إينالابريل', 'drug', 'acei', [], 'pill', ['enalapril', 'renitec']),
  d('losartan', 'Losartan', 'لوسارتان', 'drug', 'arb', [], 'pill', ['losartan', 'cozaar']),
  d('valsartan', 'Valsartan', 'فالسارتان', 'drug', 'arb', [], 'pill', ['valsartan', 'diovan']),
  d('amlodipine', 'Amlodipine', 'أملوديبين', 'drug', 'ccb', [], 'pill', ['amlodipine', 'norvasc', 'amlor']),
  d('hydrochlorothiazide', 'Hydrochlorothiazide', 'هيدروكلوروثيازايد', 'drug', 'thiazide', [], 'pill', ['hydrochlorothiazide', 'hctz']),
  d('furosemide', 'Furosemide', 'فيوروسيميد', 'drug', 'loop_diuretic', [], 'pill', ['furosemide', 'lasix']),
  d('spironolactone', 'Spironolactone', 'سبيرونولاكتون', 'drug', 'k_sparing', [], 'pill', ['spironolactone', 'aldactone']),
  d('metoprolol', 'Metoprolol', 'ميتوبرولول', 'drug', 'beta_blocker', [], 'pill', ['metoprolol', 'lopressor', 'betaloc']),
  d('atenolol', 'Atenolol', 'أتينولول', 'drug', 'beta_blocker', [], 'pill', ['atenolol', 'tenormin']),
  d('propranolol', 'Propranolol', 'بروبرانولول', 'drug', 'beta_blocker', ['nonselective_bb'], 'pill', ['propranolol', 'inderal']),
  d('digoxin', 'Digoxin', 'ديجوكسين', 'drug', 'cardiac_glycoside', [], 'pill', ['digoxin', 'lanoxin']),
  d('atorvastatin', 'Atorvastatin', 'أتورفاستاتين', 'drug', 'statin', [], 'pill', ['atorvastatin', 'lipitor']),
  d('simvastatin', 'Simvastatin', 'سيمفاستاتين', 'drug', 'statin', [], 'pill', ['simvastatin', 'zocor']),
  // --- stomach
  d('omeprazole', 'Omeprazole', 'أوميبرازول', 'drug', 'ppi', [], 'capsule', ['omeprazole', 'losec', 'prilosec']),
  d('pantoprazole', 'Pantoprazole', 'بانتوبرازول', 'drug', 'ppi', [], 'pill', ['pantoprazole', 'controloc', 'protonix']),
  // --- other
  d('methotrexate', 'Methotrexate', 'ميثوتريكسات', 'drug', 'dmard', [], 'pill', ['methotrexate', 'trexall']),
  d('methadone', 'Methadone', 'ميثادون', 'drug', 'opioid', [], 'syrup', ['methadone']),
  d('tramadol', 'Tramadol', 'ترامادول', 'drug', 'opioid', [], 'capsule', ['tramadol', 'tramal']),
  d('sertraline', 'Sertraline', 'سيرترالين', 'drug', 'ssri', [], 'pill', ['sertraline', 'zoloft', 'lustral']),
  d('diazepam', 'Diazepam', 'ديازيبام', 'drug', 'benzodiazepine', [], 'pill', ['diazepam', 'valium']),
  d('levothyroxine', 'Levothyroxine', 'ليفوثيروكسين', 'drug', 'thyroid', [], 'pill', ['levothyroxine', 'eltroxin', 'euthyrox']),
  d('amoxicillin', 'Amoxicillin', 'أموكسيسيلين', 'drug', 'penicillin', [], 'capsule', ['amoxicillin', 'augmentin', 'amoxil']),
  // --- supplements
  d('vitamin_b12', 'Vitamin B12', 'فيتامين ب12', 'supplement', undefined, [], 'injection', ['cyanocobalamin', 'methylcobalamin', 'cobalamin', 'b12']),
  d('niacin', 'Niacin', 'نياسين', 'supplement', undefined, [], 'capsule', ['niacin', 'nicotinic']),
  d('vitamin_k', 'Vitamin K', 'فيتامين ك', 'supplement', undefined, [], 'pill', ['phytonadione', 'menaquinone']),
  d('vitamin_d', 'Vitamin D', 'فيتامين د', 'supplement', undefined, [], 'capsule', ['cholecalciferol']),
  d('folic_acid', 'Folic acid', 'حمض الفوليك', 'supplement', undefined, [], 'pill', ['folic']),
  d('calcium', 'Calcium', 'كالسيوم', 'supplement', undefined, ['mineral'], 'pill', ['calcium']),
  d('iron', 'Iron', 'حديد', 'supplement', undefined, ['mineral'], 'pill', ['ferrous', 'iron']),
  d('magnesium', 'Magnesium', 'مغنيسيوم', 'supplement', undefined, ['mineral'], 'pill', ['magnesium']),
  d('potassium', 'Potassium', 'بوتاسيوم', 'supplement', undefined, [], 'pill', ['potassium']),
  d('st_johns_wort', "St John's Wort", 'نبتة سانت جون', 'supplement', undefined, [], 'capsule', ['hypericum']),
  d('ginkgo', 'Ginkgo biloba', 'الجنكة', 'supplement', undefined, [], 'capsule', ['ginkgo']),
  d('fish_oil', 'Fish oil (Omega-3)', 'زيت السمك (أوميغا 3)', 'supplement', undefined, [], 'capsule', ['omega']),
];

/**
 * Regional brand names -> active ingredients shared by every variant of that brand
 * (so a "Plus"/"HCT" variant is never over-claimed). Used by OCR matching only;
 * the user always confirms detected medicines before they are saved.
 */
export const BRANDS: Record<string, string[]> = {
  exval: ['amlodipine', 'valsartan'],
  wamlox: ['amlodipine', 'valsartan'],
  exforge: ['amlodipine', 'valsartan'],
  arbiten: ['valsartan'],
  angiosar: ['valsartan'],
  diostar: ['valsartan'],
  anginet: ['valsartan', 'hydrochlorothiazide'],
};

const BY_ID = new Map(DRUGS.map((x) => [x.id, x]));

export function findDrug(id?: string): KbDrug | undefined {
  return id ? BY_ID.get(id) : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Autocomplete search: prefix matches first, then substring matches. */
export function searchDrugs(query: string, limit = 8): KbDrug[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { drug: KbDrug; score: number }[] = [];
  for (const drug of DRUGS) {
    const names = [norm(drug.en), drug.ar, ...drug.keys];
    let score = -1;
    for (const n of names) {
      if (n.startsWith(q)) score = Math.max(score, 2);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ drug, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.drug.en.localeCompare(b.drug.en))
    .slice(0, limit)
    .map((s) => s.drug);
}

/** Resolve a free-text name to a KB drug (exact name/key match only). */
export function resolveName(name: string): KbDrug | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return DRUGS.find((x) => norm(x.en) === n || x.ar === name.trim() || x.keys.includes(n));
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export const CLASS_NAMES: Record<string, Bi> = {
  nsaid: { en: 'anti-inflammatory pain relievers (NSAIDs)', ar: 'مسكنات مضادة للالتهاب (NSAIDs)' },
  anticoagulant: { en: 'blood thinners', ar: 'مميّعات الدم' },
  antiplatelet: { en: 'antiplatelet medicines', ar: 'مضادات الصفائح الدموية' },
  acei: { en: 'ACE inhibitors (blood pressure)', ar: 'مثبطات الإنزيم المحوّل للأنجيوتنسين (للضغط)' },
  arb: { en: 'angiotensin receptor blockers (blood pressure)', ar: 'حاصرات مستقبلات الأنجيوتنسين (للضغط)' },
  ccb: { en: 'calcium channel blockers', ar: 'حاصرات قنوات الكالسيوم' },
  thiazide: { en: 'thiazide water pills', ar: 'مدرّات البول الثيازيدية' },
  loop_diuretic: { en: 'loop water pills', ar: 'مدرّات البول العروية' },
  k_sparing: { en: 'potassium-sparing water pills', ar: 'مدرّات بول حافظة للبوتاسيوم' },
  beta_blocker: { en: 'beta blockers', ar: 'حاصرات بيتا' },
  statin: { en: 'statins (cholesterol)', ar: 'الستاتينات (للكوليسترول)' },
  ppi: { en: 'stomach-acid reducers (PPIs)', ar: 'مثبطات حموضة المعدة (PPIs)' },
  sulfonylurea: { en: 'sulfonylurea diabetes medicines', ar: 'أدوية السكري من فئة السلفونيل يوريا' },
  opioid: { en: 'opioid pain medicines', ar: 'مسكنات أفيونية' },
  benzodiazepine: { en: 'benzodiazepines (sedatives)', ar: 'البنزوديازيبينات (مهدئات)' },
  ssri: { en: 'SSRI antidepressants', ar: 'مضادات الاكتئاب (SSRI)' },
  penicillin: { en: 'penicillin antibiotics', ar: 'مضادات البنسلين الحيوية' },
  biguanide: { en: 'metformin-type diabetes medicines', ar: 'أدوية السكري من نوع الميتفورمين' },
  insulin: { en: 'insulin', ar: 'الإنسولين' },
  analgesic: { en: 'pain relievers', ar: 'مسكنات الألم' },
  dmard: { en: 'disease-modifying medicines', ar: 'أدوية معدّلة للمرض' },
  cardiac_glycoside: { en: 'digitalis medicines', ar: 'أدوية الديجيتال' },
  thyroid: { en: 'thyroid medicines', ar: 'أدوية الغدة الدرقية' },
};

// ---------------------------------------------------------------------------
// Profile options
// ---------------------------------------------------------------------------

export interface ProfileOption {
  id: string;
  en: string;
  ar: string;
}

export const CHRONIC_CONDITIONS: ProfileOption[] = [
  { id: 'hypertension', en: 'High blood pressure', ar: 'ارتفاع ضغط الدم' },
  { id: 'diabetes', en: 'Diabetes', ar: 'السكري' },
  { id: 'kidney_disease', en: 'Kidney disease', ar: 'أمراض الكلى' },
  { id: 'heart_disease', en: 'Heart disease', ar: 'أمراض القلب' },
  { id: 'heart_failure', en: 'Heart failure', ar: 'فشل القلب' },
  { id: 'asthma', en: 'Asthma', ar: 'الربو' },
  { id: 'liver_disease', en: 'Liver disease', ar: 'أمراض الكبد' },
  { id: 'stomach_ulcer', en: 'Stomach ulcer', ar: 'قرحة المعدة' },
  { id: 'high_cholesterol', en: 'High cholesterol', ar: 'ارتفاع الكوليسترول' },
  { id: 'thyroid_disease', en: 'Thyroid disease', ar: 'أمراض الغدة الدرقية' },
];

export const ALLERGY_OPTIONS: (ProfileOption & { matchTags: string[]; weak?: boolean })[] = [
  { id: 'penicillin', en: 'Penicillin', ar: 'البنسلين', matchTags: ['penicillin'] },
  { id: 'aspirin_nsaids', en: 'Aspirin / NSAID pain relievers', ar: 'الأسبرين / مسكنات NSAID', matchTags: ['nsaid'] },
  {
    id: 'sulfa',
    en: 'Sulfa drugs',
    ar: 'أدوية السلفا',
    matchTags: ['hydrochlorothiazide', 'furosemide', 'gliclazide', 'glimepiride'],
    weak: true,
  },
];

export function optionLabel(opts: ProfileOption[], id: string, lang: 'ar' | 'en'): string {
  if (id.startsWith('custom:')) return id.slice(7);
  const o = opts.find((x) => x.id === id);
  return o ? o[lang] : id;
}

// ---------------------------------------------------------------------------
// Advice (by severity)
// ---------------------------------------------------------------------------

export const ADVICE: Record<Severity, Bi> = {
  major: {
    en: "Speak to your doctor or pharmacist before your next dose. Don't stop any medicine on your own unless you are told to.",
    ar: 'تحدّث مع طبيبك أو الصيدلي قبل جرعتك القادمة. لا توقف أي دواء من تلقاء نفسك ما لم يُطلب منك ذلك.',
  },
  moderate: {
    en: 'Mention this to your doctor or pharmacist soon, or at your next visit.',
    ar: 'ناقش الأمر مع طبيبك أو الصيدلي في أقرب وقت أو في زيارتك القادمة.',
  },
  minor: {
    en: 'Usually no urgent action is needed. Keep it in mind and ask your pharmacist if you have questions.',
    ar: 'لا يتطلب الأمر غالباً إجراءً عاجلاً. ضعه في اعتبارك واسأل الصيدلي إن كانت لديك استفسارات.',
  },
};

// ---------------------------------------------------------------------------
// Drug-drug / drug-supplement interactions
// ---------------------------------------------------------------------------

export interface Reason {
  title: Bi;
  text: Bi;
}

/** Placeholders: {a} {b} drug names, {c} condition, {d} days, {n} count, {x} allergy. */
export const INTERACTION_REASONS: Record<string, Reason> = {
  bleeding: {
    title: { en: 'Higher bleeding risk', ar: 'زيادة خطر النزيف' },
    text: { en: '{a} together with {b} can increase the risk of bleeding.', ar: 'تناول {a} مع {b} قد يزيد خطر النزيف.' },
  },
  bleeding_dual: {
    title: { en: 'Higher bleeding risk', ar: 'زيادة خطر النزيف' },
    text: {
      en: '{a} and {b} are sometimes prescribed together on purpose, but the combination raises the risk of bleeding.',
      ar: 'يصف الأطباء {a} مع {b} معاً أحياناً عن قصد، لكن الجمع بينهما يزيد خطر النزيف.',
    },
  },
  vitk_warfarin: {
    title: { en: 'Weaker warfarin effect', ar: 'ضعف تأثير الوارفارين' },
    text: {
      en: '{b} can make {a} less effective, so clots become more likely. Keep your vitamin K intake steady.',
      ar: 'قد يُضعف {b} تأثير {a} فيزداد احتمال تكوّن الجلطات. حافظ على ثبات كمية فيتامين ك التي تتناولها.',
    },
  },
  herbal_induction: {
    title: { en: 'Weaker medicine effect', ar: 'ضعف تأثير الدواء' },
    text: {
      en: '{b} can lower the level of {a} in the blood, making it less effective.',
      ar: 'قد يخفّض {b} مستوى {a} في الدم فيضعف تأثيره.',
    },
  },
  paracetamol_warfarin: {
    title: { en: 'Stronger warfarin effect', ar: 'زيادة تأثير الوارفارين' },
    text: {
      en: 'Regular daily use of {b} can increase the effect of {a}. Your INR may need closer monitoring.',
      ar: 'الاستخدام اليومي المنتظم لـ{b} قد يزيد تأثير {a}. قد يحتاج الطبيب لمتابعة فحص INR بشكل أدق.',
    },
  },
  hyperkalemia: {
    title: { en: 'High potassium risk', ar: 'خطر ارتفاع البوتاسيوم' },
    text: {
      en: '{a} with {b} can raise potassium in the blood to a dangerous level, which may affect the heart.',
      ar: 'تناول {a} مع {b} قد يرفع البوتاسيوم في الدم إلى مستوى خطير قد يؤثر على القلب.',
    },
  },
  dual_raas: {
    title: { en: 'Overlapping blood-pressure action', ar: 'تأثير متداخل على الضغط والكلى' },
    text: {
      en: '{a} and {b} both act on the same hormone system. Together they can harm the kidneys and raise potassium.',
      ar: '{a} و{b} يعملان على نفس النظام الهرموني. الجمع بينهما قد يضر الكلى ويرفع البوتاسيوم.',
    },
  },
  raas_nsaid: {
    title: { en: 'Kidney strain and weaker pressure control', ar: 'إجهاد الكلى وضعف التحكم بالضغط' },
    text: {
      en: '{b} can weaken the effect of {a} and put extra strain on the kidneys.',
      ar: 'قد يُضعف {b} تأثير {a} ويزيد الضغط على الكلى.',
    },
  },
  mtx_nsaid: {
    title: { en: 'Risk of methotrexate toxicity', ar: 'خطر سُمّية الميثوتريكسات' },
    text: {
      en: '{b} can raise methotrexate levels in the body and cause serious toxicity.',
      ar: 'قد يرفع {b} مستوى الميثوتريكسات في الجسم ويسبب سُمّية خطيرة.',
    },
  },
  mtx_ppi: {
    title: { en: 'Higher methotrexate levels', ar: 'ارتفاع مستوى الميثوتريكسات' },
    text: {
      en: '{b} can raise methotrexate levels, especially at higher doses.',
      ar: 'قد يرفع {b} مستوى الميثوتريكسات خاصةً مع الجرعات العالية.',
    },
  },
  cns_resp: {
    title: { en: 'Dangerous drowsiness and slow breathing', ar: 'نعاس شديد وبطء في التنفس' },
    text: {
      en: '{a} with {b} can cause extreme drowsiness and dangerously slow breathing.',
      ar: 'تناول {a} مع {b} قد يسبب نعاساً شديداً وبطءاً خطيراً في التنفس.',
    },
  },
  opioid_opioid: {
    title: { en: 'Two opioid medicines', ar: 'دواءان من الأفيونيات' },
    text: {
      en: '{a} and {b} are both opioids. Together they raise the risk of overdose, slow breathing and seizures.',
      ar: '{a} و{b} من الأدوية الأفيونية. الجمع بينهما يزيد خطر الجرعة الزائدة وبطء التنفس والتشنجات.',
    },
  },
  serotonin: {
    title: { en: 'Serotonin syndrome risk', ar: 'خطر متلازمة السيروتونين' },
    text: {
      en: '{a} with {b} can cause serotonin syndrome (agitation, fast heartbeat, fever, shaking).',
      ar: 'تناول {a} مع {b} قد يسبب متلازمة السيروتونين (هياج، تسارع نبضات القلب، حمّى، رعشة).',
    },
  },
  statin_ccb: {
    title: { en: 'Higher risk of muscle damage', ar: 'زيادة خطر تلف العضلات' },
    text: {
      en: '{b} can raise the level of {a}, increasing the risk of muscle pain and damage. The {a} dose is usually limited.',
      ar: 'قد يرفع {b} مستوى {a} في الدم مما يزيد خطر آلام العضلات وتلفها، ولذلك تُحدَّد جرعة {a} عادةً.',
    },
  },
  statin_niacin: {
    title: { en: 'Higher risk of muscle problems', ar: 'زيادة خطر مشاكل العضلات' },
    text: {
      en: '{a} with {b} (at cholesterol-lowering doses) may increase the risk of muscle problems.',
      ar: 'تناول {a} مع {b} (بجرعات خفض الكوليسترول) قد يزيد خطر مشاكل العضلات.',
    },
  },
  digoxin_thiazide: {
    title: { en: 'Risk of digoxin toxicity', ar: 'خطر سُمّية الديجوكسين' },
    text: {
      en: '{b} can lower potassium, which makes {a} toxicity more likely.',
      ar: 'قد يخفّض {b} البوتاسيوم مما يزيد احتمال سُمّية {a}.',
    },
  },
  absorption: {
    title: { en: 'Reduced absorption', ar: 'انخفاض الامتصاص' },
    text: {
      en: '{b} can reduce how much {a} your body absorbs. Take them at least 4 hours apart.',
      ar: 'قد يقلل {b} من امتصاص الجسم لـ{a}. تناولهما بفاصل 4 ساعات على الأقل.',
    },
  },
  clopidogrel_ppi: {
    title: { en: 'Weaker clopidogrel effect', ar: 'ضعف تأثير كلوبيدوغريل' },
    text: {
      en: '{b} can reduce how well {a} is activated in the body, making it less protective.',
      ar: 'قد يقلل {b} من تفعيل {a} في الجسم فتقل فعاليته الوقائية.',
    },
  },
  ibuprofen_aspirin: {
    title: { en: 'Weaker heart protection', ar: 'ضعف حماية القلب' },
    text: {
      en: '{b} can block the heart-protective effect of low-dose {a}, and both raise the risk of stomach bleeding.',
      ar: 'قد يمنع {b} تأثير {a} الواقي للقلب بالجرعات المنخفضة، كما أن كليهما يزيد خطر نزيف المعدة.',
    },
  },
  bb_hypoglycemia: {
    title: { en: 'Hidden low blood sugar', ar: 'إخفاء أعراض انخفاض السكر' },
    text: {
      en: '{a} can hide warning signs of low blood sugar (such as a fast heartbeat) in people taking {b}.',
      ar: 'قد يُخفي {a} علامات الإنذار لانخفاض السكر (مثل تسارع القلب) عند استخدام {b}.',
    },
  },
  metformin_aspirin: {
    title: { en: 'Stronger sugar-lowering effect', ar: 'تأثير أقوى في خفض السكر' },
    text: {
      en: 'High doses of {b} can increase the sugar-lowering effect of {a}. Monitor your blood sugar.',
      ar: 'الجرعات العالية من {b} قد تزيد تأثير {a} في خفض السكر. تابع مستوى السكر لديك.',
    },
  },
};

export interface InteractionRule {
  a: string;
  b: string;
  sev: Severity;
  reason: string;
}

export const INTERACTIONS: InteractionRule[] = [
  { a: 'warfarin', b: 'nsaid', sev: 'major', reason: 'bleeding' },
  { a: 'warfarin', b: 'antiplatelet', sev: 'major', reason: 'bleeding' },
  { a: 'warfarin', b: 'vitamin_k', sev: 'moderate', reason: 'vitk_warfarin' },
  { a: 'warfarin', b: 'st_johns_wort', sev: 'major', reason: 'herbal_induction' },
  { a: 'warfarin', b: 'ginkgo', sev: 'moderate', reason: 'bleeding' },
  { a: 'warfarin', b: 'fish_oil', sev: 'minor', reason: 'bleeding' },
  { a: 'warfarin', b: 'paracetamol', sev: 'minor', reason: 'paracetamol_warfarin' },
  { a: 'acei', b: 'arb', sev: 'major', reason: 'dual_raas' },
  { a: 'acei', b: 'k_sparing', sev: 'major', reason: 'hyperkalemia' },
  { a: 'arb', b: 'k_sparing', sev: 'major', reason: 'hyperkalemia' },
  { a: 'acei', b: 'potassium', sev: 'major', reason: 'hyperkalemia' },
  { a: 'arb', b: 'potassium', sev: 'major', reason: 'hyperkalemia' },
  { a: 'k_sparing', b: 'potassium', sev: 'major', reason: 'hyperkalemia' },
  { a: 'acei', b: 'nsaid_other', sev: 'moderate', reason: 'raas_nsaid' },
  { a: 'arb', b: 'nsaid_other', sev: 'moderate', reason: 'raas_nsaid' },
  { a: 'methotrexate', b: 'nsaid', sev: 'major', reason: 'mtx_nsaid' },
  { a: 'methotrexate', b: 'ppi', sev: 'moderate', reason: 'mtx_ppi' },
  { a: 'opioid', b: 'benzodiazepine', sev: 'major', reason: 'cns_resp' },
  { a: 'methadone', b: 'tramadol', sev: 'major', reason: 'opioid_opioid' },
  { a: 'tramadol', b: 'ssri', sev: 'major', reason: 'serotonin' },
  { a: 'st_johns_wort', b: 'ssri', sev: 'major', reason: 'serotonin' },
  { a: 'simvastatin', b: 'amlodipine', sev: 'moderate', reason: 'statin_ccb' },
  { a: 'statin', b: 'niacin', sev: 'moderate', reason: 'statin_niacin' },
  { a: 'digoxin', b: 'thiazide', sev: 'moderate', reason: 'digoxin_thiazide' },
  { a: 'levothyroxine', b: 'mineral', sev: 'moderate', reason: 'absorption' },
  { a: 'clopidogrel', b: 'omeprazole', sev: 'moderate', reason: 'clopidogrel_ppi' },
  { a: 'ssri', b: 'nsaid', sev: 'moderate', reason: 'bleeding' },
  { a: 'ssri', b: 'anticoagulant', sev: 'moderate', reason: 'bleeding' },
  { a: 'aspirin', b: 'clopidogrel', sev: 'moderate', reason: 'bleeding_dual' },
  { a: 'aspirin', b: 'ibuprofen', sev: 'moderate', reason: 'ibuprofen_aspirin' },
  { a: 'aspirin', b: 'ginkgo', sev: 'moderate', reason: 'bleeding' },
  { a: 'beta_blocker', b: 'insulin', sev: 'moderate', reason: 'bb_hypoglycemia' },
  { a: 'beta_blocker', b: 'sulfonylurea', sev: 'moderate', reason: 'bb_hypoglycemia' },
  { a: 'metformin', b: 'aspirin', sev: 'minor', reason: 'metformin_aspirin' },
];

export const DUPLICATE_REASONS = {
  ingredient: {
    title: { en: 'Same medicine listed twice', ar: 'الدواء نفسه مكرر' } as Bi,
    text: {
      en: '{a} appears more than once in your list. Taking it twice can lead to an overdose.',
      ar: 'يظهر {a} أكثر من مرة في قائمتك. تناوله مرتين قد يؤدي إلى جرعة زائدة.',
    } as Bi,
  },
  cls: {
    title: { en: 'Two medicines of the same type', ar: 'دواءان من النوع نفسه' } as Bi,
    text: {
      en: '{a} and {b} are both {c}. Taking two of the same type is usually not needed and raises the risk of side effects.',
      ar: '{a} و{b} كلاهما من {c}. تناول دواءين من النوع نفسه غير ضروري عادةً ويزيد خطر الآثار الجانبية.',
    } as Bi,
  },
};

// ---------------------------------------------------------------------------
// Health-condition rules
// ---------------------------------------------------------------------------

export const CONDITION_REASONS: Record<string, Reason> = {
  kidney_nsaid: {
    title: { en: 'May harm the kidneys', ar: 'قد يضر الكلى' },
    text: {
      en: '{a} can reduce kidney function. This is a particular concern with {c}.',
      ar: 'قد يقلل {a} من وظائف الكلى، وهذا مصدر قلق خاص لدى من يعاني من {c}.',
    },
  },
  kidney_metformin: {
    title: { en: 'Needs kidney monitoring', ar: 'يحتاج متابعة الكلى' },
    text: {
      en: 'With {c}, {a} may need a lower dose or may not be suitable. Your kidney function should be checked regularly.',
      ar: 'مع {c} قد يحتاج {a} إلى جرعة أقل أو قد لا يكون مناسباً، ويجب فحص وظائف الكلى بانتظام.',
    },
  },
  kidney_potassium: {
    title: { en: 'Risk of high potassium', ar: 'خطر ارتفاع البوتاسيوم' },
    text: {
      en: 'With {c}, {a} can cause potassium to build up to a dangerous level.',
      ar: 'مع {c} قد يتسبب {a} في تراكم البوتاسيوم إلى مستوى خطير.',
    },
  },
  kidney_raas: {
    title: { en: 'Needs regular blood tests', ar: 'يحتاج فحوصات دم منتظمة' },
    text: {
      en: '{a} can affect kidney function and potassium. With {c} these should be checked regularly.',
      ar: 'قد يؤثر {a} على وظائف الكلى والبوتاسيوم. مع {c} يجب فحصهما بانتظام.',
    },
  },
  kidney_mtx: {
    title: { en: 'Risk of methotrexate toxicity', ar: 'خطر سُمّية الميثوتريكسات' },
    text: {
      en: 'With {c}, the body clears {a} more slowly, which can cause serious toxicity.',
      ar: 'مع {c} يتخلص الجسم من {a} ببطء مما قد يسبب سُمّية خطيرة.',
    },
  },
  bp_nsaid: {
    title: { en: 'May raise blood pressure', ar: 'قد يرفع ضغط الدم' },
    text: {
      en: '{a} can raise blood pressure and weaken blood-pressure medicines in people with {c}.',
      ar: 'قد يرفع {a} ضغط الدم ويُضعف أدوية الضغط لدى من يعاني من {c}.',
    },
  },
  hf_nsaid: {
    title: { en: 'May worsen heart failure', ar: 'قد يزيد فشل القلب سوءاً' },
    text: {
      en: '{a} can cause fluid retention and make {c} worse.',
      ar: 'قد يسبب {a} احتباس السوائل ويزيد من سوء {c}.',
    },
  },
  heart_nsaid: {
    title: { en: 'Heart risk', ar: 'خطر على القلب' },
    text: {
      en: 'Regular use of {a} may increase the risk of heart attack and stroke in people with {c}.',
      ar: 'الاستخدام المنتظم لـ{a} قد يزيد خطر النوبات القلبية والسكتة لدى من يعاني من {c}.',
    },
  },
  liver_mtx: {
    title: { en: 'May harm the liver', ar: 'قد يضر الكبد' },
    text: {
      en: '{a} can damage the liver, which is a particular concern with {c}.',
      ar: 'قد يسبب {a} ضرراً للكبد، وهذا مصدر قلق خاص لدى من يعاني من {c}.',
    },
  },
  liver_statin: {
    title: { en: 'Needs liver monitoring', ar: 'يحتاج متابعة الكبد' },
    text: {
      en: 'With {c}, {a} should be used with care and liver tests checked.',
      ar: 'مع {c} يجب استخدام {a} بحذر مع فحص وظائف الكبد.',
    },
  },
  liver_paracetamol: {
    title: { en: 'Lower daily dose limit', ar: 'حدّ أقل للجرعة اليومية' },
    text: {
      en: 'With {c}, the safe daily dose of {a} is lower than usual. Ask your doctor for your limit.',
      ar: 'مع {c} تكون الجرعة اليومية الآمنة من {a} أقل من المعتاد. اسأل طبيبك عن الحد المناسب لك.',
    },
  },
  asthma_nsbb: {
    title: { en: 'May trigger asthma attacks', ar: 'قد يُحفّز نوبات الربو' },
    text: {
      en: '{a} can narrow the airways and trigger attacks in people with {c}.',
      ar: 'قد يضيّق {a} المجاري التنفسية ويُحفّز النوبات لدى من يعاني من {c}.',
    },
  },
  asthma_bb: {
    title: { en: 'Use with caution', ar: 'يُستخدم بحذر' },
    text: {
      en: '{a} can sometimes make {c} worse. Your doctor should be aware.',
      ar: 'قد يزيد {a} من سوء {c} أحياناً. يجب أن يكون طبيبك على علم بذلك.',
    },
  },
  asthma_nsaid: {
    title: { en: 'May trigger breathing problems', ar: 'قد يسبب مشاكل تنفسية' },
    text: {
      en: '{a} can trigger breathing problems in some people with {c}.',
      ar: 'قد يسبب {a} مشاكل في التنفس لدى بعض من يعاني من {c}.',
    },
  },
  ulcer_nsaid: {
    title: { en: 'Stomach bleeding risk', ar: 'خطر نزيف المعدة' },
    text: {
      en: '{a} can irritate the stomach lining and cause bleeding, especially with {c}.',
      ar: 'قد يهيّج {a} بطانة المعدة ويسبب النزيف، خاصةً مع {c}.',
    },
  },
  diabetes_bb: {
    title: { en: 'Hidden low blood sugar', ar: 'إخفاء أعراض انخفاض السكر' },
    text: {
      en: '{a} can hide the warning signs of low blood sugar in people with {c}.',
      ar: 'قد يُخفي {a} علامات الإنذار لانخفاض السكر لدى من يعاني من {c}.',
    },
  },
  diabetes_thiazide: {
    title: { en: 'May raise blood sugar', ar: 'قد يرفع سكر الدم' },
    text: {
      en: '{a} can slightly raise blood sugar in people with {c}.',
      ar: 'قد يرفع {a} سكر الدم قليلاً لدى من يعاني من {c}.',
    },
  },
  diabetes_niacin: {
    title: { en: 'May raise blood sugar', ar: 'قد يرفع سكر الدم' },
    text: {
      en: '{a} can raise blood sugar, which can make {c} harder to control.',
      ar: 'قد يرفع {a} سكر الدم مما يجعل التحكم في {c} أصعب.',
    },
  },
};

export interface ConditionRule {
  cond: string;
  match: string;
  sev: Severity;
  reason: string;
}

export const CONDITION_RULES: ConditionRule[] = [
  { cond: 'kidney_disease', match: 'nsaid', sev: 'major', reason: 'kidney_nsaid' },
  { cond: 'kidney_disease', match: 'metformin', sev: 'moderate', reason: 'kidney_metformin' },
  { cond: 'kidney_disease', match: 'k_sparing', sev: 'major', reason: 'kidney_potassium' },
  { cond: 'kidney_disease', match: 'potassium', sev: 'major', reason: 'kidney_potassium' },
  { cond: 'kidney_disease', match: 'acei', sev: 'moderate', reason: 'kidney_raas' },
  { cond: 'kidney_disease', match: 'arb', sev: 'moderate', reason: 'kidney_raas' },
  { cond: 'kidney_disease', match: 'methotrexate', sev: 'major', reason: 'kidney_mtx' },
  { cond: 'hypertension', match: 'nsaid_other', sev: 'moderate', reason: 'bp_nsaid' },
  { cond: 'heart_failure', match: 'nsaid_other', sev: 'major', reason: 'hf_nsaid' },
  { cond: 'heart_disease', match: 'nsaid_other', sev: 'moderate', reason: 'heart_nsaid' },
  { cond: 'liver_disease', match: 'methotrexate', sev: 'major', reason: 'liver_mtx' },
  { cond: 'liver_disease', match: 'statin', sev: 'moderate', reason: 'liver_statin' },
  { cond: 'liver_disease', match: 'paracetamol', sev: 'moderate', reason: 'liver_paracetamol' },
  { cond: 'asthma', match: 'nonselective_bb', sev: 'major', reason: 'asthma_nsbb' },
  { cond: 'asthma', match: 'beta_blocker', sev: 'moderate', reason: 'asthma_bb' },
  { cond: 'asthma', match: 'nsaid', sev: 'moderate', reason: 'asthma_nsaid' },
  { cond: 'stomach_ulcer', match: 'nsaid', sev: 'major', reason: 'ulcer_nsaid' },
  { cond: 'diabetes', match: 'beta_blocker', sev: 'moderate', reason: 'diabetes_bb' },
  { cond: 'diabetes', match: 'thiazide', sev: 'minor', reason: 'diabetes_thiazide' },
  { cond: 'diabetes', match: 'niacin', sev: 'moderate', reason: 'diabetes_niacin' },
];

// ---------------------------------------------------------------------------
// Age rules
// ---------------------------------------------------------------------------

export const AGE_REASONS: Record<string, Reason> = {
  nsaid_elderly: {
    title: { en: 'Higher risk in older adults', ar: 'خطر أعلى لدى كبار السن' },
    text: {
      en: '{a} can cause stomach bleeding, kidney problems and raised blood pressure more easily after age 65.',
      ar: 'قد يسبب {a} نزيف المعدة ومشاكل الكلى وارتفاع الضغط بسهولة أكبر بعد سن 65.',
    },
  },
  benzo_elderly: {
    title: { en: 'Falls and confusion', ar: 'خطر السقوط والارتباك' },
    text: {
      en: '{a} can cause confusion, dizziness and falls in older adults. Do not stop it suddenly; ask your doctor about safer options.',
      ar: 'قد يسبب {a} ارتباكاً ودوخة وسقوطاً لدى كبار السن. لا توقفه فجأة، واسأل طبيبك عن بدائل أكثر أماناً.',
    },
  },
  opioid_elderly: {
    title: { en: 'Drowsiness and falls', ar: 'النعاس وخطر السقوط' },
    text: {
      en: '{a} can cause drowsiness, confusion and falls in older adults.',
      ar: 'قد يسبب {a} نعاساً وارتباكاً وسقوطاً لدى كبار السن.',
    },
  },
  aspirin_primary: {
    title: { en: 'Check if you still need it', ar: 'تأكد أنك ما زلت بحاجة إليه' },
    text: {
      en: 'If you take {a} only to prevent a first heart attack, the bleeding risk may outweigh the benefit after age 70. Ask your doctor.',
      ar: 'إن كنت تتناول {a} فقط للوقاية من أول نوبة قلبية، فقد يفوق خطر النزيف فائدته بعد سن 70. اسأل طبيبك.',
    },
  },
  aspirin_child: {
    title: { en: 'Not suitable for children', ar: 'غير مناسب لصغار السن' },
    text: {
      en: '{a} should not be given to children and teenagers because of the risk of Reye’s syndrome, a rare but serious illness.',
      ar: 'لا يُعطى {a} للأطفال والمراهقين بسبب خطر متلازمة راي، وهي حالة نادرة لكنها خطيرة.',
    },
  },
};

export interface AgeRule {
  match: string;
  min?: number;
  max?: number;
  sev: Severity;
  reason: string;
}

export const AGE_RULES: AgeRule[] = [
  { match: 'nsaid_other', min: 65, sev: 'moderate', reason: 'nsaid_elderly' },
  { match: 'benzodiazepine', min: 65, sev: 'major', reason: 'benzo_elderly' },
  { match: 'opioid', min: 65, sev: 'moderate', reason: 'opioid_elderly' },
  { match: 'aspirin', min: 70, sev: 'minor', reason: 'aspirin_primary' },
  { match: 'aspirin', max: 15, sev: 'major', reason: 'aspirin_child' },
];

// ---------------------------------------------------------------------------
// Long-term use
// ---------------------------------------------------------------------------

export const LONGTERM_REASONS: Record<string, Reason> = {
  ppi_long: {
    title: { en: 'Long-term use', ar: 'استخدام طويل الأمد' },
    text: {
      en: '{a} has been used for about {d} days. Long-term use can lower vitamin B12 and magnesium and weaken bones. Ask whether you still need it.',
      ar: 'تستخدم {a} منذ حوالي {d} يوماً. الاستخدام الطويل قد يخفض فيتامين ب12 والمغنيسيوم ويُضعف العظام. اسأل طبيبك إن كنت لا تزال بحاجة إليه.',
    },
  },
  benzo_long: {
    title: { en: 'Long-term use', ar: 'استخدام طويل الأمد' },
    text: {
      en: '{a} taken for about {d} days can lead to dependence and a weaker effect. Do not stop suddenly; ask your doctor for a plan.',
      ar: 'تناول {a} لمدة {d} يوماً تقريباً قد يؤدي إلى الاعتماد وضعف التأثير. لا توقفه فجأة، واسأل طبيبك عن خطة مناسبة.',
    },
  },
  opioid_long: {
    title: { en: 'Long-term use', ar: 'استخدام طويل الأمد' },
    text: {
      en: '{a} used for about {d} days can lead to tolerance and dependence. Review your treatment plan with your doctor.',
      ar: 'استخدام {a} لمدة {d} يوماً تقريباً قد يؤدي إلى التعوّد والاعتماد. راجع خطة علاجك مع طبيبك.',
    },
  },
  metformin_long: {
    title: { en: 'Long-term use', ar: 'استخدام طويل الأمد' },
    text: {
      en: 'Long-term {a} use can lower vitamin B12. Ask for a yearly vitamin B12 blood test.',
      ar: 'الاستخدام الطويل لـ{a} قد يخفض فيتامين ب12. اطلب فحص فيتامين ب12 في الدم سنوياً.',
    },
  },
  nsaid_long: {
    title: { en: 'Regular use for weeks', ar: 'استخدام منتظم لأسابيع' },
    text: {
      en: '{a} used regularly for about {d} days raises the risk of stomach, kidney and heart problems. Ask about alternatives.',
      ar: 'استخدام {a} بانتظام لمدة {d} يوماً تقريباً يزيد خطر مشاكل المعدة والكلى والقلب. اسأل عن بدائل.',
    },
  },
};

export interface LongTermRule {
  match: string;
  minDays: number;
  sev: Severity;
  reason: string;
}

export const LONGTERM_RULES: LongTermRule[] = [
  { match: 'ppi', minDays: 56, sev: 'minor', reason: 'ppi_long' },
  { match: 'benzodiazepine', minDays: 28, sev: 'moderate', reason: 'benzo_long' },
  { match: 'opioid', minDays: 90, sev: 'minor', reason: 'opioid_long' },
  { match: 'metformin', minDays: 365, sev: 'minor', reason: 'metformin_long' },
  { match: 'nsaid_other', minDays: 14, sev: 'moderate', reason: 'nsaid_long' },
];

// ---------------------------------------------------------------------------
// Misc alert texts
// ---------------------------------------------------------------------------

export const ALLERGY_TEXT = {
  title: { en: 'Possible allergy', ar: 'حساسية محتملة' } as Bi,
  strong: {
    en: 'You told us you are allergic to {x}. {a} may cause a reaction.',
    ar: 'ذكرت أنك تعاني من حساسية تجاه {x}. قد يسبب {a} تفاعلاً تحسسياً.',
  } as Bi,
  weak: {
    en: 'You told us you are allergic to {x}. A reaction to {a} is uncommon but possible.',
    ar: 'ذكرت أنك تعاني من حساسية تجاه {x}. التفاعل مع {a} غير شائع لكنه ممكن.',
  } as Bi,
};

export const POLYPHARMACY_TEXT = {
  title: { en: 'Many medicines at once', ar: 'تتناول عدة أدوية في وقت واحد' } as Bi,
  text: {
    en: 'You are taking {n} medicines. The more medicines you take, the higher the chance of side effects and interactions. Bring this list to your doctor or pharmacist for a review.',
    ar: 'تتناول {n} أدوية. كلما زاد عدد الأدوية زاد احتمال الآثار الجانبية والتداخلات. اعرض هذه القائمة على طبيبك أو الصيدلي لمراجعتها.',
  } as Bi,
};

export const UNVERIFIED_TEXT = {
  title: { en: 'Not checked yet', ar: 'لم يتم فحصه بعد' } as Bi,
  text: {
    en: 'We do not have safety information for {a} yet, so it could not be checked. Ask your pharmacist about it.',
    ar: 'لا تتوفر لدينا معلومات السلامة عن {a} بعد، لذلك لم يتم فحصه. اسأل الصيدلي عنه.',
  } as Bi,
};
