#!/usr/bin/env python3
"""
patient_screen.py - patient-specific screening: age / sex / pregnancy, diseases, allergies.

It reads three sheets of Clinical_Safety_Database_MultiSource_v4.xlsx (34 core drugs, free-text rules):
    Drug_Age_And_Sex_Rules          -> "Older adults: higher GI-bleed risk. Pregnancy: avoid ..."
    Drug_Disease_Contraindications  -> contraindications (;-separated) + precautions (;-separated)
    Drug_Allergies_Sensitivities    -> allergy / cross-reactivity text + excipient sensitivities

and compares them with a Patient profile for every package found in the photo.

How the free text is "understood" (transparent rules - read the tables below):
  * CONDITIONS   : one row per condition = (words a patient might type, words the database uses for it)
  * AGE GROUPS   : "Older adults" -> age >= 65, "Children/teens" -> age < 18, "Pregnancy" -> patient.pregnant ...
  * ALLERGENS    : drug classes (penicillin, sulfa, NSAID ...), direct drug names, and excipients (lactose ...)
Every alert quotes the database text it came from, so a human can judge it.

Nothing here imports interaction_checker.py; the checker passes in its own `canon_many` name normaliser.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import pandas as pd

SEVERITY_RANK = {"CONTRAINDICATED": 3, "WARNING": 2, "PRECAUTION": 1, "CHECK": 0}
CATEGORY_TITLE = {"ALLERGY": "Allergy", "DISEASE": "Disease", "AGE": "Age / population",
                  "PREGNANCY": "Pregnancy", "EXCIPIENT": "Excipient"}


# ============================================================================
# 1. Patient profile
# ============================================================================
@dataclass
class Patient:
    age: Optional[float] = None            # years
    sex: Optional[str] = None              # 'F' | 'M' | None
    pregnant: Optional[bool] = None
    breastfeeding: bool = False
    ancestry: Optional[str] = None         # e.g. 'asian' (one rosuvastatin rule depends on it)
    conditions: list = field(default_factory=list)   # free text: ["peptic ulcer", "kidney disease"]
    allergies: list = field(default_factory=list)    # free text: ["penicillin", "lactose"]

    def __post_init__(self):
        s = (self.sex or "").strip().lower()
        self.sex = "F" if s in ("f", "female", "woman", "w") else "M" if s in ("m", "male", "man") else None
        self.conditions = _as_list(self.conditions)
        self.allergies = _as_list(self.allergies)

    @property
    def empty(self) -> bool:
        return (self.age is None and not self.sex and self.pregnant is None and not self.conditions
                and not self.allergies and not self.ancestry and not self.breastfeeding)

    def summary(self) -> str:
        bits = []
        if self.age is not None:
            bits.append(f"age {self.age:g}")
        if self.sex:
            bits.append("female" if self.sex == "F" else "male")
        if self.pregnant is not None:
            bits.append("pregnant" if self.pregnant else "not pregnant")
        if self.breastfeeding:
            bits.append("breastfeeding")
        if self.ancestry:
            bits.append(f"{self.ancestry} ancestry")
        if self.conditions:
            bits.append("conditions: " + ", ".join(self.conditions))
        if self.allergies:
            bits.append("allergies: " + ", ".join(self.allergies))
        return "; ".join(bits) or "(empty profile)"

    @classmethod
    def from_json(cls, path) -> "Patient":
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(age=d.get("age"), sex=d.get("sex"), pregnant=d.get("pregnant"),
                   breastfeeding=bool(d.get("breastfeeding", False)), ancestry=d.get("ancestry"),
                   conditions=d.get("conditions", []), allergies=d.get("allergies", []))

    def to_json(self) -> dict:
        return {"age": self.age, "sex": self.sex, "pregnant": self.pregnant, "breastfeeding": self.breastfeeding,
                "ancestry": self.ancestry, "conditions": self.conditions, "allergies": self.allergies}


def _as_list(x) -> list:
    if x is None:
        return []
    if isinstance(x, str):
        return [p.strip() for p in re.split(r"[,;]", x) if p.strip()]
    return [str(p).strip() for p in x if str(p).strip()]


# ============================================================================
# 2. Vocabulary tables  (edit these to teach the screen new words)
# ============================================================================
# condition id -> (label, regex for what a PATIENT types, regex for what the DATABASE TEXT says)
CONDITIONS: dict[str, tuple[str, str, str]] = {
    "gi_ulcer_bleed":   ("GI ulcer / GI bleeding", r"ulcer|gi bleed|gastro\w* bleed|stomach bleed|gastric bleed",
                         r"peptic ulcer|gi bleeding|\bgi bleed|erosive gi|\bulcer"),
    "bleeding_disorder": ("bleeding disorder", r"bleeding disorder|ha?emophilia|von willebrand|thrombocytop\w*|bleeding tendency|clotting disorder|active bleeding",
                          r"bleeding disorder|active major bleeding|significant bleeding risk"),
    "renal":            ("kidney (renal) impairment", r"kidney|renal|\bckd\b|dialysis|nephro\w*|egfr",
                         r"renal impairment|renal dose|egfr|anuria|interstitial nephritis|renal or hepatic|renal/hepatic"),
    "renal_artery":     ("renal artery stenosis", r"renal artery stenosis", r"renal artery stenosis"),
    "hepatic":          ("liver (hepatic) impairment", r"liver|hepat\w*|cirrhosis|jaundice|transaminase",
                         r"hepatic|liver disease|transaminase"),
    "heart_failure":    ("heart failure", r"heart failure|\bchf\b|cardiac failure", r"heart failure"),
    "hypertension":     ("hypertension", r"hypertension|high blood pressure|\bhtn\b", r"hypertension"),
    "hypotension":      ("hypotension", r"hypotension|low blood pressure", r"hypotension"),
    "cardiovascular":   ("cardiovascular / vascular disease", r"coronary|\bcad\b|angina|myocardial|heart attack|stroke|cardiovascular|peripheral (vascular|arter\w*)|\bpad\b|\bpvd\b|aortic",
                         r"cardiovascular disease|coronary artery disease|aortic|peripheral vascular|cabg"),
    "arrhythmia":       ("arrhythmia / QT / heart block", r"arrhythm\w*|atrial fibrillation|\baf\b|\bqt\b|long qt|torsades|heart block|bradycardia|tachycardia",
                         r"arrhythmia|\bqt\b|torsades|heart block|bradycardia|tachycardia"),
    "diabetes":         ("diabetes", r"diabet\w*|\bdm\b|type [12]|hyperglyc\w*|blood sugar", r"diabet|hyperglycemia"),
    "hypoglycemia":     ("hypoglycemia", r"hypoglyc\w*|low blood sugar", r"hypoglycemia"),
    "asthma_copd":      ("asthma / COPD", r"asthma|copd|emphysema|chronic bronchitis|bronchospasm|lung disease",
                         r"asthma|copd|bronchospasm|respiratory insufficiency|hypoxemia"),
    "resp_depression":  ("sleep apnea / respiratory depression", r"sleep ap?noea|sleep apnea|respiratory depression|respiratory failure",
                         r"sleep apnea|respiratory depression|respiratory insufficiency"),
    "glaucoma":         ("glaucoma", r"glaucoma", r"glaucoma"),
    "seizure":          ("epilepsy / seizures", r"epilep\w*|seizure", r"seizure"),
    "psychiatric":      ("depression / mania / suicidality", r"depress\w*|bipolar|mania|suicid\w*|psychiat\w*|mental",
                         r"\bmania\b|suicid|neuropsychiatric|\bmood\b"),
    "dependence":       ("substance dependence / misuse", r"addiction|dependence|substance use|opioid use disorder|misuse",
                         r"addiction|dependence|misuse|withdrawal"),
    "gout":             ("gout", r"gout|hyperuric\w*", r"\bgout\b|uric acid"),
    "osteoporosis":     ("osteoporosis", r"osteopor\w*|bone loss", r"osteoporosis|bone health"),
    "myasthenia":       ("myasthenia gravis", r"myasthenia", r"myasthenia"),
    "infection":        ("infection / C. difficile", r"infection|c\.? ?diff\w*|clostridi\w*|mononucleosis", r"infection|c\. difficile|mononucleosis"),
    "hyperkalemia":     ("high potassium", r"hyperkal\w*|high potassium", r"hyperkalemia|potassium supplements"),
    "hypokalemia":      ("low potassium", r"hypokal\w*|low potassium", r"hypokalemia"),
    "hyponatremia":     ("low sodium", r"hyponat\w*|low sodium", r"hyponatremia"),
    "hypomagnesemia":   ("low magnesium", r"hypomagn\w*|low magnesium", r"hypomagnesemia"),
    "dehydration":      ("dehydration / low volume", r"dehydrat\w*|volume depletion", r"dehydration|volume status|electrolyte depletion"),
    "adrenal":          ("adrenal insufficiency (Addison)", r"addison|adrenal insufficiency", r"addison|adrenal cortical insufficiency"),
    "lupus":            ("lupus", r"lupus", r"lupus"),
    "alcohol":          ("heavy alcohol use", r"alcohol\w*|heavy drinking", r"alcohol"),
    "malnutrition":     ("malnutrition / fasting", r"malnutrition|malnourish\w*|underweight|fasting", r"malnutrition|fasting"),
    "b12_folate":       ("B12 / folate deficiency", r"b12|folate", r"b12 deficiency|folate deficiency"),
    "surgery":          ("recent / planned surgery", r"surgery|surgical|cabg|bypass|operation|tonsillectomy", r"surgery|cabg"),
    "neuropathy":       ("peripheral neuropathy", r"neuropathy", r"peripheral neuropathy"),
    "tendon":           ("tendon disorder", r"tendon|tendinitis", r"tendinitis|tendon"),
    "cytopenia":        ("low blood counts", r"cytopeni\w*|leukopenia|neutropenia", r"cytopenias"),
    "photosensitivity": ("photosensitivity", r"photosensitiv\w*|sun sensitiv\w*", r"photosensitivity"),
}
_COND_PATIENT = {k: re.compile(v[1], re.I) for k, v in CONDITIONS.items()}
_COND_DB = {k: re.compile(v[2], re.I) for k, v in CONDITIONS.items()}

# words in a clause that mean "only in a particular type / severity" -> the alert asks the user to check
QUALIFIER_RE = re.compile(r"\b(severe|moderate|significant|decompensated|active|acute|uncontrolled|unstable|prior|known|"
                          r"recent|major|late|egfr|until corrected)\b", re.I)
ALLERGY_CLAUSE_RE = re.compile(r"hypersensitiv|angioedema|allerg", re.I)      # handled by the allergy pass

# ---- age groups: label word(s) in the age-rule sheet -> predicate(age)
AGE_GROUPS = [   # (regex on the label, name, test)
    (re.compile(r"older adult|elderly|geriatric", re.I), "age >= 65", lambda a: a >= 65),
    (re.compile(r"neonat", re.I), "neonate (<= 1 month)", lambda a: a <= 1 / 12),
    (re.compile(r"infant", re.I), "infant (< 2 y)", lambda a: a < 2),
    (re.compile(r"young children", re.I), "young child (< 6 y)", lambda a: a < 6),
    (re.compile(r"adolescent|teen", re.I), "adolescent (12-17 y)", lambda a: 12 <= a < 18),
    (re.compile(r"pediatric|paediatric", re.I), "pediatric (< 18 y)", lambda a: a < 18),
    (re.compile(r"(?<!young )children|child", re.I), "child (< 12 y)", lambda a: a < 12),
]

# ---- allergens: patient word -> (id, direct classes, cross-reactive classes)
# drug classes of ingredients (canonical names as produced by interaction_checker.canon)
DRUG_CLASSES: dict[str, set] = {
    "aspirin": {"nsaid", "salicylate"}, "ibuprofen": {"nsaid"}, "naproxen": {"nsaid"},
    "amoxicillin": {"penicillin"}, "clavulanic acid": {"penicillin"},
    "cefixime": {"cephalosporin"}, "cefuroxime": {"cephalosporin"}, "cephalexin": {"cephalosporin"},
    "sulfamethoxazole": {"sulfonamide_antibiotic"},
    "hydrochlorothiazide": {"sulfonamide_nonantibiotic"}, "furosemide": {"sulfonamide_nonantibiotic"},
    "glipizide": {"sulfonamide_nonantibiotic"},
    "azithromycin": {"macrolide"}, "clarithromycin": {"macrolide"}, "erythromycin": {"macrolide"},
    "ciprofloxacin": {"fluoroquinolone"}, "moxifloxacin": {"fluoroquinolone"}, "levofloxacin": {"fluoroquinolone"},
    "lisinopril": {"ace_inhibitor"}, "losartan": {"arb"}, "valsartan": {"arb"}, "telmisartan": {"arb"},
    "atorvastatin": {"statin"}, "simvastatin": {"statin"}, "rosuvastatin": {"statin"},
    "alprazolam": {"benzodiazepine"}, "tramadol": {"opioid"}, "prednisone": {"corticosteroid"},
    "dexamethasone": {"corticosteroid"}, "sertraline": {"ssri"},
}
ALLERGENS = [    # (regex on patient text, label, direct classes, cross-reactive classes)
    (re.compile(r"penicillin|amoxicillin|ampicillin|augmentin|beta[- ]?lactam", re.I), "penicillin", {"penicillin"}, {"cephalosporin"}),
    (re.compile(r"cephalosporin|cefixime|ceftriaxone|cefuroxime|cephalexin", re.I), "cephalosporin", {"cephalosporin"}, {"penicillin"}),
    (re.compile(r"sulfa\b|sulpha|sulfon\w*|sulfamethoxazole|bactrim|septra|co-?trimoxazole", re.I), "sulfonamide (sulfa)", {"sulfonamide_antibiotic"}, {"sulfonamide_nonantibiotic"}),
    (re.compile(r"nsaid|anti-?inflammator\w*", re.I), "NSAIDs", {"nsaid"}, set()),
    (re.compile(r"aspirin|salicylate|acetylsalicylic", re.I), "aspirin / salicylate", {"salicylate"}, {"nsaid"}),
    (re.compile(r"macrolide|azithromycin|erythromycin|clarithromycin", re.I), "macrolides", {"macrolide"}, set()),
    (re.compile(r"quinolone|ciprofloxacin|levofloxacin|moxifloxacin|cipro\b", re.I), "fluoroquinolones", {"fluoroquinolone"}, set()),
    (re.compile(r"ace[- ]?inhibitor|lisinopril|enalapril|ramipril", re.I), "ACE inhibitors", {"ace_inhibitor"}, {"arb"}),
    (re.compile(r"statin", re.I), "statins", {"statin"}, set()),
    (re.compile(r"benzodiazepine|alprazolam|diazepam|xanax", re.I), "benzodiazepines", {"benzodiazepine"}, set()),
    (re.compile(r"opioid|tramadol|codeine|morphine", re.I), "opioids", {"opioid"}, set()),
    (re.compile(r"corticosteroid|steroid|prednisone|dexamethasone", re.I), "corticosteroids", {"corticosteroid"}, set()),
]
# excipients: patient word -> (label, regex that finds it in the DB's excipient text)
EXCIPIENTS = [
    (re.compile(r"lactose|milk sugar|dairy", re.I), "lactose", re.compile(r"lactose", re.I)),
    (re.compile(r"gluten|celiac|coeliac|wheat", re.I), "gluten", re.compile(r"gluten", re.I)),
    (re.compile(r"dye|tartrazine|colou?r(ing|ant)", re.I), "dyes / tartrazine", re.compile(r"dye|tartrazine", re.I)),
    (re.compile(r"gelatin|gelatine|capsule", re.I), "gelatin", re.compile(r"gelatin|capsule components", re.I)),
    (re.compile(r"sulfite|sulphite", re.I), "sulfites", re.compile(r"sulfite", re.I)),
    (re.compile(r"aspartame|phenylketonuria|\bpku\b|sweetener", re.I), "aspartame / sweeteners", re.compile(r"aspartame|sweetener", re.I)),
    (re.compile(r"sucrose|sugar|fructose", re.I), "sucrose", re.compile(r"sucrose", re.I)),
    (re.compile(r"alcohol", re.I), "alcohol", re.compile(r"alcohol", re.I)),
]


# ============================================================================
# 3. Rules loaded from the workbook
# ============================================================================
@dataclass
class Rule:
    generic_name: str
    contraindications: list
    precautions: list
    age_rules: list              # [(label, text), ...]
    allergy_text: str
    excipient_text: str


class PatientRules:
    def __init__(self, rules: dict, canon_many: Callable[[str], list]):
        self.rules, self.canon_many = rules, canon_many

    @classmethod
    def load(cls, xlsx, canon_many: Callable[[str], list]) -> "PatientRules":
        def sheet(name):
            try:
                return pd.read_excel(xlsx, sheet_name=name, header=3)
            except ValueError:
                return pd.DataFrame(columns=["generic_name"])
        dis, age, alg = (sheet("Drug_Disease_Contraindications"), sheet("Drug_Age_And_Sex_Rules"),
                         sheet("Drug_Allergies_Sensitivities"))
        by = {}
        for df, key in ((dis, "dis"), (age, "age"), (alg, "alg")):
            for _, r in df.iterrows():
                by.setdefault(str(r["generic_name"]), {})[key] = r
        rules = {}
        for name, parts in by.items():
            d, a, g = parts.get("dis"), parts.get("age"), parts.get("alg")
            rule = Rule(
                name,
                _split_clauses(d["disease_contraindications"]) if d is not None else [],
                _split_clauses(d["disease_precautions_and_adjustments"]) if d is not None else [],
                _split_age_rules(a["age_and_population_risks"]) if a is not None else [],
                str(g["allergy_and_cross_reactivity_risks"]) if g is not None else "",
                str(g["important_excipient_sensitivities"]) if g is not None else "")
            for ing in canon_many(name):               # Trimethoprim-Sulfamethoxazole -> both components
                rules[ing] = rule
        return cls(rules, canon_many)

    def for_ingredient(self, ing: str, targets: dict) -> tuple[Optional[Rule], str]:
        """(rule, note).  Falls back to the DB 'target ingredient' (esomeprazole -> omeprazole) with a note."""
        if ing in self.rules:
            return self.rules[ing], ""
        tg = targets.get(ing)
        if tg and tg in self.rules:
            return self.rules[tg], f"no rules for {ing.title()}; using the rules of its DB target ingredient {tg.title()}"
        return None, ""


def _split_clauses(text) -> list:
    return [c.strip() for c in re.split(r";\s*", str(text)) if c.strip() and str(text) != "nan"]


def _split_age_rules(text) -> list:
    """'Older adults: x. Pregnancy: y.' -> [('Older adults','x.'), ('Pregnancy','y.')]; unlabeled text is attached to the previous label."""
    out = []
    for sent in re.split(r"(?<=\.)\s+", str(text).strip()):
        m = re.match(r"^([A-Z][^:.]{2,70}):\s*(.*)$", sent)
        if m:
            out.append([m.group(1).strip(), m.group(2).strip()])
        elif out:
            out[-1][1] += " " + sent
        else:
            first = sent.split()[0] if sent.split() else ""
            out.append([first or "general", sent])
    return [(a, b) for a, b in out]


# ============================================================================
# 4. Screening
# ============================================================================
def map_conditions(conditions: list, pregnant: Optional[bool]) -> tuple[dict, list]:
    """patient's free-text conditions -> ({condition_id: original text}, [texts the vocabulary does not know])"""
    ids, unmapped = {}, []
    for text in conditions:
        hit = [k for k, rx in _COND_PATIENT.items() if rx.search(text)]
        if not hit:
            unmapped.append(text)
        for k in hit:
            ids.setdefault(k, text)
    if pregnant:
        ids.setdefault("pregnancy", "pregnant")
    return ids, unmapped


def _alert(pkg, ing, category, severity, message, source, sheet, note="") -> dict:
    return {"pkg_id": pkg.pkg_id, "brand": pkg.label, "ingredient": ing, "category": category,
            "severity": severity, "message": message, "source_text": source, "sheet": sheet, "note": note}


def screen_patient(rules: PatientRules, pkgs: list, patient: Patient) -> dict:
    """
    pkgs: objects with .pkg_id, .label, .ingredients (canonical names), .targets (dict)
    returns {'profile', 'alerts', 'unmapped_conditions', 'unmapped_allergies', 'no_rules', 'notes'}
    """
    cond_ids, unmapped_cond = map_conditions(patient.conditions, patient.pregnant)
    alerts: list[dict] = []
    no_rules: list[str] = []
    notes: list[str] = []
    allergen_texts = [(t, [a for a in ALLERGENS if a[0].search(t)], [e for e in EXCIPIENTS if e[0].search(t)])
                      for t in patient.allergies]
    unmapped_alg = [t for t, a, e in allergen_texts if not a and not e]
    can_be_pregnant = patient.sex == "F" and patient.age is not None and 12 <= patient.age <= 55 and patient.pregnant is None

    seen_rules = set()
    for p in pkgs:
        for ing in dict.fromkeys(p.ingredients):
            rule, note = rules.for_ingredient(ing, getattr(p, "targets", {}) or {})
            if rule is None:
                no_rules.append(f"{p.label} [#{p.pkg_id}] ({ing.title()})")
                # no DB text for this drug, but the allergy-CLASS check (penicillin -> cefixime, sulfa, NSAID ...)
                # does not need DB text, so it still runs
                alerts += _allergy_alerts(p, ing, Rule(ing, [], [], [], "", ""), patient, allergen_texts)
                continue
            if note and (p.pkg_id, ing) not in seen_rules:
                notes.append(f"{p.label} [#{p.pkg_id}]: {note}")
            seen_rules.add((p.pkg_id, ing))
            alerts += _disease_alerts(p, ing, rule, cond_ids, patient)
            alerts += _age_alerts(p, ing, rule, cond_ids, patient, can_be_pregnant)
            alerts += _allergy_alerts(p, ing, rule, patient, allergen_texts)

    # one alert per (package, ingredient, category, message): combination products repeat rules
    uniq, seen = [], set()
    for a in alerts:
        k = (a["pkg_id"], a["category"], a["message"], a["source_text"])
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    uniq.sort(key=lambda a: (-SEVERITY_RANK[a["severity"]], a["pkg_id"], a["category"]))
    if patient.age is None:
        notes.append("age not provided - age-specific rules were not applied")
    return {"profile": patient.summary(), "alerts": uniq, "unmapped_conditions": unmapped_cond,
            "unmapped_allergies": unmapped_alg, "no_rules": no_rules, "notes": notes}


# ---- diseases ---------------------------------------------------------------
def _disease_alerts(p, ing, rule, cond_ids, patient) -> list:
    out = []
    for clauses, severity, label in ((rule.contraindications, "CONTRAINDICATED", "contraindication"),
                                     (rule.precautions, "PRECAUTION", "precaution")):
        for clause in clauses:
            if ALLERGY_CLAUSE_RE.search(clause):
                continue                                              # allergy pass handles these
            hit = [k for k in cond_ids if k != "pregnancy" and _COND_DB[k].search(clause)]
            msg = ""
            if hit:
                names = ", ".join(sorted({CONDITIONS[k][0] for k in hit}))
                msg = f"{label}: {clause}  (matches patient's {names})"
            # demographic clauses inside the disease sheet
            m = re.search(r"children younger than (\d+)", clause, re.I)
            if m and patient.age is not None and patient.age < int(m.group(1)):
                msg = f"{label}: {clause}  (patient is {patient.age:g})"
            m = re.search(r"age (\d+)\+", clause, re.I)
            if m and patient.age is not None and patient.age >= int(m.group(1)):
                msg = f"{label}: {clause}  (patient is {patient.age:g}; the other criteria in the clause also apply)"
            if re.search(r"children or teens|children/teens|children and adolescents", clause, re.I) \
                    and patient.age is not None and patient.age < 18:
                msg = f"{label}: {clause}  (patient is {patient.age:g})"
            if re.search(r"\bpregnan", clause, re.I) and ("pregnancy" in cond_ids or patient.pregnant):
                msg = f"{label}: {clause}  (patient is pregnant)"
            if msg:
                if QUALIFIER_RE.search(clause) and "(" in msg:
                    msg += " - check that the severity / type stated applies"
                out.append(_alert(p, ing, "PREGNANCY" if re.search(r"pregnan", clause, re.I) else "DISEASE",
                                  severity, msg, clause, "Drug_Disease_Contraindications"))
    return out


# ---- age / sex / pregnancy ----------------------------------------------------
def _age_alerts(p, ing, rule, cond_ids, patient, can_be_pregnant) -> list:
    out = []
    for label, text in rule.age_rules:
        reasons, pregnancy_label = [], False
        for group in re.split(r"\s+and\s+|/|,", label):
            g = group.strip()
            if not g:
                continue
            if re.search(r"pregnan", g, re.I):
                pregnancy_label = True
                if patient.pregnant:
                    reasons.append("patient is pregnant")
                elif patient.pregnant is None and can_be_pregnant:
                    reasons.append("pregnancy status not given (female of reproductive age)")
                continue
            if re.search(r"asian", g, re.I):
                if patient.ancestry and "asian" in patient.ancestry.lower():
                    reasons.append("patient is of Asian ancestry")
                continue
            if re.search(r"renal", g, re.I) and "renal" in cond_ids:
                reasons.append("patient has kidney impairment")
                continue
            if re.search(r"cardiac|heart", g, re.I) and {"heart_failure", "cardiovascular", "arrhythmia"} & set(cond_ids):
                reasons.append("patient has heart disease")
                continue
            if re.search(r"liver|hepatic", g, re.I) and "hepatic" in cond_ids:
                reasons.append("patient has liver impairment")
                continue
            if patient.age is not None:
                for rx, name, test in AGE_GROUPS:
                    if rx.search(g) and test(patient.age):
                        reasons.append(f"patient is {patient.age:g} ({name})")
                        break
        if not reasons:
            continue
        unknown = all("not given" in r for r in reasons)
        out.append(_alert(p, ing, "PREGNANCY" if pregnancy_label else "AGE",
                          "CHECK" if unknown else "WARNING",
                          f"{label}: {text}  ({'; '.join(reasons)})", f"{label}: {text}", "Drug_Age_And_Sex_Rules"))
    return out


# ---- allergies ----------------------------------------------------------------
NO_DB_TEXT = "(no DB allergy text for this drug - matched by the app's drug-class table)"


def _allergy_alerts(p, ing, rule, patient, allergen_texts) -> list:
    out = []
    src = rule.allergy_text or NO_DB_TEXT
    my_classes = DRUG_CLASSES.get(ing, set())
    brand_norm = re.sub(r"[^a-z0-9]", "", (p.label or "").lower())
    for text, allergens, excipients in allergen_texts:
        t_norm = re.sub(r"[^a-z0-9]", "", text.lower())
        direct = (t_norm and (t_norm == re.sub(r"[^a-z0-9]", "", ing.lower()) or t_norm == brand_norm))
        if direct:
            out.append(_alert(p, ing, "ALLERGY", "CONTRAINDICATED",
                              f"patient reports an allergy to '{text}' - this package contains {ing.title()}",
                              src, "Drug_Allergies_Sensitivities"))
            continue
        for rx, label, direct_cls, cross_cls in allergens:
            if my_classes & direct_cls:
                out.append(_alert(p, ing, "ALLERGY", "CONTRAINDICATED",
                                  f"patient reports {label} allergy ('{text}') - {ing.title()} belongs to this class",
                                  src, "Drug_Allergies_Sensitivities"))
            elif my_classes & cross_cls:
                out.append(_alert(p, ing, "ALLERGY", "WARNING",
                                  f"possible cross-reactivity: patient reports {label} allergy ('{text}'); "
                                  f"{ing.title()} is in a related class",
                                  src, "Drug_Allergies_Sensitivities"))
        for rx, label, db_rx in excipients:
            if db_rx.search(rule.excipient_text):
                out.append(_alert(p, ing, "EXCIPIENT", "CHECK",
                                  f"patient reports {label} sensitivity ('{text}'); DB: {rule.excipient_text}",
                                  rule.excipient_text, "Drug_Allergies_Sensitivities",
                                  note="read the leaflet of the exact product"))
        if not allergens and not excipients:                           # unknown allergen word: try the DB text itself
            words = [w for w in re.findall(r"[a-z]{4,}", text.lower())]
            blob = (rule.allergy_text + " " + rule.excipient_text).lower()
            if any(w in blob for w in words):
                out.append(_alert(p, ing, "ALLERGY", "CHECK",
                                  f"'{text}' is mentioned in the DB allergy / excipient text for {ing.title()}",
                                  rule.allergy_text + " | " + rule.excipient_text, "Drug_Allergies_Sensitivities"))
    return out


# ============================================================================
# 5. Text output
# ============================================================================
def format_patient_section(res: Optional[dict]) -> list[str]:
    L = ["\n5. PATIENT-SPECIFIC ALERTS  (age / sex / pregnancy, diseases, allergies - per medicine)"]
    if res is None:
        L.append("   no patient profile supplied. Add  --age 72 --sex F --conditions \"kidney disease, peptic ulcer\" "
                 "--allergies \"penicillin, lactose\"  (or --patient profile.json) to screen for them.")
        return L
    L.append(f"   Patient: {res['profile']}")
    alerts = res["alerts"]
    if not alerts:
        L.append("   no age / disease / allergy alert found for the identified medicines")
    by_pkg: dict = {}
    for a in alerts:
        by_pkg.setdefault((a["pkg_id"], a["brand"]), []).append(a)
    for (pid, brand), items in sorted(by_pkg.items()):
        L.append(f"   {brand} [#{pid}]  - {', '.join(sorted({i['ingredient'].title() for i in items}))}")
        for a in items:
            L.append(f"       [{a['severity']}] {CATEGORY_TITLE[a['category']]}: {a['message']}")
            if a["note"]:
                L.append(f"            ({a['note']})")
    if res["unmapped_conditions"]:
        L.append("   Not understood (not in the condition vocabulary, NOT screened): "
                 + ", ".join(res["unmapped_conditions"]))
    if res["unmapped_allergies"]:
        L.append("   Allergies not recognised as a drug class or excipient (only searched as text): "
                 + ", ".join(res["unmapped_allergies"]))
    if res["no_rules"]:
        L.append("   No age/disease/allergy rules in the database for: " + "; ".join(res["no_rules"])
                 + "  (the DB covers the 34 core drugs only)")
    for n in res["notes"]:
        L.append(f"   note: {n}")
    return L
