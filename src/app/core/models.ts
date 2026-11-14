export type Lang = 'ar' | 'en';

/** Bilingual text. */
export interface Bi {
  ar: string;
  en: string;
}

export type MedForm = 'capsule' | 'pill' | 'injection' | 'spray' | 'drop' | 'syrup' | 'other';
export const MED_FORMS: MedForm[] = ['capsule', 'pill', 'injection', 'spray', 'drop', 'syrup', 'other'];

export type FreqUnit = 'hour' | 'day' | 'week';

export interface Medication {
  id: string;
  /** Display name (English/brand as entered or taken from the knowledge base). */
  name: string;
  /** Knowledge-base id when the medicine is recognised; undefined for free-text names. */
  kbId?: string;
  /** Strength per unit, e.g. "500mg". Optional. */
  strength?: string;
  /** Number of units per intake (0.5, 1, 2 ...). */
  dose: number;
  form: MedForm;
  everyN: number;
  everyUnit: FreqUnit;
  /** yyyy-mm-dd */
  startDate: string;
  /** HH:mm — time of the first dose of the day. */
  time: string;
  active: boolean;
  source: 'manual' | 'scan';
  createdAt: string;
}

export type Sex = 'F' | 'M';

export interface HealthProfile {
  age: number | null;
  /** Used by the clinical database for pregnancy / breastfeeding rules. */
  sex: Sex | null;
  /** null = not stated. Only meaningful when sex is 'F'. */
  pregnant: boolean | null;
  breastfeeding: boolean;
  /** Ids from CHRONIC_CONDITIONS or `custom:<text>`. */
  chronic: string[];
  /** Ids from ALLERGY_OPTIONS or `custom:<text>`. */
  allergies: string[];
  /** Free-text medical history items (surgeries, hospital stays...). */
  history: string[];
  notes: string;
  completed: boolean;
}

export interface User {
  name: string;
  email: string;
  provider: 'email' | 'apple' | 'google';
}

export type Severity = 'major' | 'moderate' | 'minor';

export type AlertKind =
  | 'duplicate'
  | 'interaction'
  | 'age'
  | 'condition'
  | 'longterm'
  | 'allergy'
  | 'polypharmacy'
  | 'pregnancy'
  | 'excipient'
  | 'unverified';

export interface SafetyAlert {
  /** Stable id so the same finding can be acknowledged once. */
  id: string;
  severity: Severity;
  kind: AlertKind;
  medIds: string[];
  title: Bi;
  message: Bi;
  advice: Bi;
  /** Set when the finding comes from the clinical database (server) rather than the on-device rules. */
  origin?: 'database';
  /** Verbatim database text behind a database finding (English). */
  evidence?: string;
}

export const EMPTY_PROFILE: HealthProfile = {
  age: null,
  sex: null,
  pregnant: null,
  breastfeeding: false,
  chronic: [],
  allergies: [],
  history: [],
  notes: '',
  completed: false,
};
