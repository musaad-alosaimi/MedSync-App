#!/usr/bin/env python3
"""
interaction_checker.py - photo of medicine packages  ->  duplicate-ingredient flags
and drug-drug interactions, using Clinical_Safety_Database_MultiSource_v4.xlsx as the
reference.

Workflow (one image in, one report out)
---------------------------------------
 1. detect packages   : segmentation + OCR re-used from drug_identifier.py
 2. scientific name   : brand / generic words found by OCR are matched against
                        (a) the DB's 34 generic names (+ every drug named in the
                        interaction sheet) and (b) brand_aliases.csv (brand -> ingredient)
 3. duplicates        : same scientific name in >= 2 packages  ->  "INCREASED DOSAGE" flag
 4. interactions      : every pair of packages is looked up in the Drug_InterActions sheet
 5. report            : each interaction with its risk (if the DB gives one) and the
                        two medicines named by BRAND; also grouped per medicine

Usage
-----
python interaction_checker.py check Test2.jpeg --out results/ \
    --age 72 --sex F \
    --conditions "peptic ulcer, chronic kidney disease" \
    --allergies "penicillin, lactose"

HONEST LIMITS
--------------------------------------------
  A pair where NEITHER drug has a list is reported as "not assessable", never as "safe".
"""
from __future__ import annotations

import argparse
import csv
import difflib
import itertools
import json
import logging
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import pandas as pd

import drug_identifier as di
from patient_screen import Patient, PatientRules, screen_patient, format_patient_section   # age / disease / allergy screen

log = logging.getLogger("interaction_checker")
HERE = Path(__file__).resolve().parent
DEFAULT_DB = HERE / "Clinical_Safety_Database_MultiSource_v4.xlsx"
DEFAULT_ALIASES = HERE / "brand_aliases.csv"

RISK_ORDER = {"Major": 3, "Moderate": 2, "Minor": 1, "Unknown": 0}
RISK_LABEL = {"Major": "MAJOR", "Moderate": "MODERATE", "Minor": "MINOR",
              "Unknown": "RISK NOT SPECIFIED IN DATABASE"}

# ============================================================================
# 1. Name canonicalisation
# ============================================================================
SYNONYMS = {                       # every spelling -> one canonical name
    "paracetamol": "acetaminophen", "apap": "acetaminophen",
    "salbutamol": "albuterol",
    "acetylsalicylic acid": "aspirin", "asa": "aspirin",
    "clavulanate": "clavulanic acid",
    "sulphamethoxazole": "sulfamethoxazole",
    "levothyroxin": "levothyroxine", "thyroxine": "levothyroxine", "l-thyroxine": "levothyroxine",
    "ciprofloxacine": "ciprofloxacin", "amoxycillin": "amoxicillin", "clavulanic": "clavulanic acid",
    "acetyl salicylic acid": "aspirin", "glibenclamide": "glyburide", "frusemide": "furosemide",
    "adrenaline": "epinephrine", "noradrenaline": "norepinephrine",
}
COMBOS = {                         # fixed-dose combinations -> their ingredients
    "trimethoprim-sulfamethoxazole": ["trimethoprim", "sulfamethoxazole"],
    "sulfamethoxazole-trimethoprim": ["trimethoprim", "sulfamethoxazole"],
    "co-trimoxazole": ["trimethoprim", "sulfamethoxazole"],
    "cotrimoxazole": ["trimethoprim", "sulfamethoxazole"],
    "amoxicillin-clavulanate": ["amoxicillin", "clavulanic acid"],
    "amoxicillin-clavulanic acid": ["amoxicillin", "clavulanic acid"],
    "co-amoxiclav": ["amoxicillin", "clavulanic acid"],
}
SALT_WORDS = {"hydrochloride", "hcl", "sodium", "potassium", "calcium", "sulfate", "sulphate",
              "maleate", "besylate", "mesylate", "tartrate", "succinate", "phosphate", "acetate",
              "citrate", "bromide", "dihydrate", "monohydrate", "medoxomil", "hemihydrate", "besilate",
              "trihydrate", "cilexetil", "fumarate", "arginine", "erbumine", "dihydrochloride", "hydrobromide",
              "tosylate", "mesilate", "valerate", "furoate", "propionate", "disodium", "magnesium", "pivoxil",
              "proxetil", "axetil", "anhydrous", "hydrate", "sesquihydrate", "lysine", "trometamol", "nitrate"}


def split_qualifier(name: str) -> tuple[str, str]:
    """'Dexamethasone (ophthalmic)' -> ('Dexamethasone', 'ophthalmic')"""
    quals = re.findall(r"\(([^)]*)\)", name)
    base = re.sub(r"\s*\([^)]*\)", "", name).strip()
    return base, "; ".join(q.strip() for q in quals)


def canon(name: str) -> str:
    """Lower-case canonical single-ingredient name (no qualifiers, salts or synonyms)."""
    base, _ = split_qualifier(str(name))
    s = re.sub(r"\s+", " ", base.lower().strip())
    words = s.split(" ")
    stripped = [w for w in words if w not in SALT_WORDS]
    if stripped:
        s = " ".join(stripped)
    return SYNONYMS.get(s, s)


def canon_many(name: str) -> list[str]:
    """Canonical ingredient list for a (possibly combination) product name."""
    base, _ = split_qualifier(str(name))
    key = re.sub(r"\s+", " ", base.lower().strip())
    if key in COMBOS:
        return list(COMBOS[key])
    parts = [p for p in re.split(r"\s*[;/+]\s*|\s+and\s+|\s*,\s*", key) if p]
    out = []
    for p in parts:
        c = canon(p)
        if c and c not in out:
            out.append(c)
    return out


def pretty(ingredient: str) -> str:
    return ingredient[:1].upper() + ingredient[1:]


# ============================================================================
# 2. Knowledge base  (DB sheets + brand table + lexicon for OCR matching)
# ============================================================================
@dataclass
class Term:
    key: str                     # normalised (A-Z0-9) text to look for on the pack
    display: str                 # how to show it
    kind: str                    # 'brand' | 'generic' | 'ext'
    ingredients: tuple           # canonical ingredient names it stands for (most common formulation)
    variants: tuple = ()         # brands: ((ingredients tuple, weight), ...) - every formulation the DB lists
    targets: dict = field(default_factory=dict)   # ingredient -> DB "Target Active Ingredient" when they differ
    source: str = "db"           # 'db' (Brands_By_Active_Ingredient sheet) | 'csv' (brand_aliases.csv)
    words: int = 1               # number of words in the brand name (a fuzzy match must span as many OCR words)


@dataclass
class PairInfo:
    risk: str
    entries: list                # [(drug A label, drug B label, risk), ...] as written in the DB


# words that end a brand stem inside a DB product name ("ASPIRIN PROTECT 100MG E.C. TABLETS" -> "ASPIRIN PROTECT")
FORM_WORDS = set("""TAB TABS TABLET TABLETS CAP CAPS CAPSULE CAPSULES CAPLET CAPLETS SYRUP SYR SUSP SUSPENSION SOLN SOLUTION
SOLUTIN INJ INJECTION INFUSION POWDER ORAL DROPS DROP GEL CREAM OINTMENT SUPP SUPPOSITORY SUPPOSITORIES SPRAY INHALER
EVOHALER LOTION FILM COATED FC F.C F.C. FCT GASTRO-RESISTANT GASTRORESISTANT DELAYED RELEASE EXTENDED MODIFIED PROLONGED
CHEWABLE DISPERSIBLE EFFERVESCENT SOLUBLE SACHET SACHETS AMP AMPOULE AMPOULES VIAL IV I.V. I.V IM FOR WITH AND IN PAEDIATRIC
PEDIATRIC CHILDREN ADULT ADULTS GLASS BOTTLE BAG BLISTER PACK POW POWD SR XR MR CR ER ODT MG MCG ML G IU""".split())
# ordinary words found on packaging: never accepted as a brand name
PACK_WORDS = set("""FILM COATED TABLETS TABLET CAPSULES CAPSULE EACH CONTAINS CONTAIN ACTIVE INGREDIENT DOSE DOSAGE ADULT ADULTS
CHILDREN STORE BELOW KEEP REACH ORAL TAKE DAILY EXPIRY BATCH MANUFACTURED PACK PLUS FORTE EXTRA COLD FLU RELIEF PAIN FEVER
SINUS ALLERGY NIGHT DAY SYRUP DROPS CREAM GEL TABS TAB CAPS CAP ONLY USE""".split())


STOP_NORM = {re.sub(r"[^A-Z0-9]", "", w) for w in FORM_WORDS | PACK_WORDS} | {"OF", "THE", "ALL", "FOR", "AND", "WITH", "ORAL"}


def brand_stem(name: str) -> list[str]:
    """Tokens of the brand part of a DB product name (everything before strength / dosage-form words)."""
    out = []
    for tok in re.split(r"\s+", str(name).replace("\t", " ").strip()):
        u = tok.upper().strip(".,;()")
        if not u:
            continue
        if u in FORM_WORDS or tok.upper() in FORM_WORDS or re.match(r"^\(?\d", u):
            break
        out.append(tok.strip(",;"))
    return out


def formulation(raw: str) -> tuple:
    return tuple(dict.fromkeys(i for part in re.split(r"[,;]", str(raw)) for i in canon_many(part)))


class KnowledgeBase:
    def __init__(self, xlsx: Path = DEFAULT_DB, aliases: Path = DEFAULT_ALIASES):
        self.xlsx, self.aliases_path = Path(xlsx), Path(aliases)
        self.drugs = pd.read_excel(xlsx, sheet_name="Drugs", header=3).dropna(subset=["generic_name"])
        inter = pd.read_excel(xlsx, sheet_name="Drug_InterActions")
        inter.columns = [c.strip().lower() for c in inter.columns]
        ren = {}
        for c in inter.columns:                        # v4 layout: Drug A / Drug B / Risk Level;  v3: drug 1 / drug 2 / risk
            if c in ("drug a", "drug 1"):
                ren[c] = "drug_a"
            elif c in ("drug b", "drug 2"):
                ren[c] = "drug_b"
            elif c in ("risk level", "risk"):
                ren[c] = "risk"
        self.inter = inter.rename(columns=ren).dropna(subset=["drug_a", "drug_b"])
        try:
            self.brands = pd.read_excel(xlsx, sheet_name="Brands_By_Active_Ingredient", header=3).dropna(
                subset=["Brand Trade Name", "Scientific Formulation"])
        except ValueError:
            self.brands = pd.DataFrame(columns=["Target Active Ingredient", "Brand Trade Name", "Scientific Formulation"])

        # ---- the 34 core drugs: the database holds their COMPLETE interaction lists
        self.core_ingredients: set[str] = {i for g in self.drugs["generic_name"] for i in canon_many(g)}

        # ---- interaction map: frozenset({a, b}) -> PairInfo (worst risk, both directions merged)
        self.pairs: dict[frozenset, PairInfo] = {}
        self.names_in_interactions: set[str] = set()
        for da, db_, risk in self.inter[["drug_a", "drug_b", "risk"]].itertuples(index=False):
            a, b = canon(da), canon(db_)
            self.names_in_interactions.update((a, b))
            if a == b:
                continue
            risk = str(risk).strip().title()
            risk = risk if risk in RISK_ORDER else "Unknown"
            info = self.pairs.setdefault(frozenset((a, b)), PairInfo("Unknown", []))
            info.entries.append((str(da), str(db_), risk))
            if RISK_ORDER[risk] > RISK_ORDER[info.risk]:
                info.risk = risk
        self.n_interaction_rows = len(self.inter)
        self.pair_count: Counter = Counter()
        for k in self.pairs:
            self.pair_count.update(k)
        # drugs whose interaction list is complete: the 34 core drugs + any other drug the DB lists in depth
        # (>= 100 pairs: desloratadine, levocetirizine, esomeprazole, levamlodipine, levosalbutamol in v4)
        self.complete: set[str] = set(self.core_ingredients) | {n for n, c in self.pair_count.items() if c >= 100}
        counts = sorted(self.pair_count[i] for i in self.complete)
        self.median_pairs = counts[len(counts) // 2] if counts else 0

        # ---- age / sex, disease and allergy rules (3 sheets, 34 core drugs)  -> see patient_screen.py
        self.rules = PatientRules.load(xlsx, canon_many)

        # ---- lexicon (generic names first, so brand stems that are really generic names can be skipped)
        self.terms: dict[str, Term] = {}
        self._load_generics()
        self._load_extended()
        self._load_db_brands()
        self._load_aliases()
        self.by_len: dict[int, list[str]] = defaultdict(list)
        for k in self.terms:
            self.by_len[len(k)].append(k)

    # -- loaders ---------------------------------------------------------
    def _add(self, key: str, display: str, kind: str, ingredients, **kw):
        k = di.norm(key)
        if len(k) < 3:
            return
        prio = {"brand": 3, "generic": 2, "ext": 1}
        old = self.terms.get(k)
        if old and prio[old.kind] >= prio[kind]:
            return
        self.terms[k] = Term(k, display, kind, tuple(ingredients), **kw)

    def _load_generics(self):
        for name in self.drugs["generic_name"]:
            ings = canon_many(name)
            base, qual = split_qualifier(name)
            for ing in ings:
                self._add(ing, pretty(ing), "generic", [ing])
            if qual:                                           # "(Paracetamol)", "(Salbutamol)"
                self._add(qual, qual, "generic", [canon(qual)])
            if len(ings) == 1:
                self._add(base, base, "generic", ings)
        for syn, target in SYNONYMS.items():
            self._add(syn, syn, "generic", [target])
        self._add("co-trimoxazole", "Co-trimoxazole", "generic", COMBOS["co-trimoxazole"])
        # every active ingredient named in the brand sheet's "Scientific Formulation" column
        for raw in self.brands["Scientific Formulation"].unique():
            for ing in formulation(raw):
                self._add(ing, pretty(ing), "generic", [ing])

    def _load_extended(self):
        for name in self.names_in_interactions:
            k = di.norm(name)
            if 7 <= len(k) <= 22:
                self._add(name, pretty(name), "ext", [name])

    def _load_db_brands(self) -> int:
        """Brand sheet -> brand terms.  Several rows (strengths / forms) share one brand stem."""
        forms: dict[str, Counter] = defaultdict(Counter)
        shown: dict[str, str] = {}
        tgts: dict[str, dict] = defaultdict(dict)
        nwords: dict[str, int] = {}
        for target, name, raw in self.brands[["Target Active Ingredient", "Brand Trade Name",
                                              "Scientific Formulation"]].itertuples(index=False):
            toks = brand_stem(name)
            if not toks:
                continue
            ings = formulation(raw)
            if not ings:
                continue
            tset = {i for part in str(target).split(";") for i in canon_many(part)}
            tmap = {}
            for ing in ings:                         # product's real active differs from the DB's target ingredient
                extra = tset - set(ings)
                if ing not in tset and len(extra) == 1:
                    tmap[ing] = next(iter(extra))
            keys = [(di.norm(" ".join(toks[:3])), " ".join(toks), 3, len([x for x in toks[:3] if di.norm(x)]))]
            if len(toks) > 1:
                keys.append((di.norm(toks[0]), toks[0], 1, 1))       # first word alone = brand family
            for key, disp, w, nw in keys:
                if len(key) < 3 or key in PACK_WORDS or key in self.terms:
                    continue
                forms[key][ings] += w
                nwords[key] = nw
                shown.setdefault(key, disp)
                tgts[key].update(tmap)
        for key, cnt in forms.items():
            variants = tuple(cnt.most_common())
            top = variants[0][0]
            self.terms[key] = Term(key, shown[key], "brand", top, variants, tgts[key],
                                   "db", nwords.get(key, 1))
        return len(forms)

    def _load_aliases(self) -> int:
        """brand_aliases.csv = supplement: only brands the database does not already know."""
        n = 0
        if self.aliases_path.exists():
            with open(self.aliases_path, newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    brand = row["brand_name"].strip()
                    ings = tuple(canon(x) for x in re.split(r"[;/]", row["ingredients"]) if x.strip())
                    k = di.norm(brand)
                    if brand and ings and k not in self.terms or (k in self.terms and self.terms[k].kind != "brand"
                                                                  and brand and ings):
                        self.terms[k] = Term(k, brand, "brand", ings, ((ings, 1),), {}, "; ".join(map(pretty, ings)), "csv",
                                           len([w for w in brand.split() if di.norm(w)]) or 1)
                        n += 1
        return n

    # -- matching ---------------------------------------------------------
    @staticmethod
    def threshold(term: Term) -> float:
        n = len(term.key)
        if n <= 4:
            return 2.0                      # exact only
        th = 0.80 if n <= 6 else 0.82 if n <= 9 else 0.85
        return max(th, 0.88) if term.kind == "ext" else th

    def match_window(self, key: str, n: int = 1, words: tuple = ()) -> Optional[tuple[Term, float]]:
        """Best term for one normalised OCR window (n OCR words, given as `words`), or None.
        Brand names are risky to match loosely (a short brand is easily 'found' inside ordinary words), so a
        non-exact brand match must span as many words as the brand has, contain no packaging word or tiny word,
        and start with the same letter unless it is a very close match."""
        t = self.terms.get(key)
        if t:
            return t, 1.0
        if len(key) < 5:
            return None
        brand_ok = all(len(w) >= 3 and w not in STOP_NORM for w in words) if words else True
        best: Optional[tuple[Term, float]] = None
        sm = difflib.SequenceMatcher(None, autojunk=False)
        sm.set_seq2(key)
        for L in range(max(3, len(key) - 4), len(key) + 5):
            for tk in self.by_len.get(L, ()):
                term = self.terms[tk]
                th = self.threshold(term)
                if th > 1.0:
                    continue
                if term.kind == "brand" and (not brand_ok or n != term.words):
                    continue
                sm.set_seq1(tk)
                if sm.real_quick_ratio() < th or sm.quick_ratio() < th:
                    continue
                s = sm.ratio()
                if len(tk) >= 7 and len(key) > len(tk) and tk in key and len(tk) / len(key) >= 0.6:
                    s = max(s, 0.93)        # name + OCR noise glued on
                if term.kind == "brand" and tk[0] != key[0] and s < 0.9:
                    continue
                if s >= th and (best is None or (s, len(tk)) > (best[1], len(best[0].key))):
                    best = (term, s)
        return best


# ============================================================================
# 3. Reading one package  (OCR tokens -> brand / ingredients / strengths)
# ============================================================================
STRENGTH_RE = re.compile(r"^(\d{1,4}(?:[.,]\d{1,2})?)(MG|MCG|UG|G|ML|IU|%)?$")
UNITS = {"MG", "MCG", "UG", "G", "ML", "IU", "%"}


@dataclass
class Hit:
    term: Term
    score: float
    span: tuple[int, int]
    strength: str = ""
    exact: bool = False


def find_hits(kb: KnowledgeBase, tokens: list[tuple[str, float]], min_score: float = 0.62) -> list[Hit]:
    toks = [(di.norm(t), c, t) for t, c in tokens if di.norm(t)]
    cand: list[Hit] = []
    for n in (1, 2, 3):
        for s in range(0, len(toks) - n + 1):
            win = toks[s:s + n]
            key = "".join(w[0] for w in win)
            if len(key) < 3:
                continue
            m = kb.match_window(key, n, tuple(w[0] for w in win))
            if not m:
                continue
            term, sim = m
            conf = min(w[1] for w in win)
            if term.kind == "brand" and len(term.key) <= 4 and conf < 0.7:
                continue                                    # 3-4 letter brand names must be read confidently
            score = sim * (0.6 + 0.4 * conf)
            if score >= min_score:
                cand.append(Hit(term, score, (s, s + n), exact=sim >= 0.999))
    # greedy non-overlapping selection: best score first, then longer span / longer term
    cand.sort(key=lambda h: (h.score, h.span[1] - h.span[0], len(h.term.key)), reverse=True)
    taken: list[Hit] = []
    used: set[int] = set()
    for h in cand:
        idx = set(range(*h.span))
        if idx & used:
            continue
        taken.append(h)
        used |= idx
    for h in taken:                                          # strength expression right after the name
        h.strength = _strength_after(toks, h.span[1])
    return taken


def _strength_after(toks, pos: int, window: int = 4) -> str:
    for j in range(pos, min(len(toks), pos + window)):
        k = toks[j][0]
        m = STRENGTH_RE.match(k)
        if not m:
            continue
        num, unit = m.group(1).replace(",", "."), m.group(2)
        if not unit and j + 1 < len(toks) and toks[j + 1][0] in UNITS:
            unit = toks[j + 1][0]
        if unit:
            return f"{num.rstrip('0').rstrip('.') if '.' in num else num} {unit.lower() if unit != '%' else '%'}"
    return ""


@dataclass
class Package:
    pkg_id: int
    brand: Optional[str]                  # brand as printed / matched (display form)
    ingredients: list[str]                # canonical scientific names, e.g. ['ibuprofen']
    strengths: dict[str, str]             # ingredient -> '200 mg'
    status: str                           # 'identified' | 'unidentified'
    how: str                              # evidence summary
    ocr_text: str
    bbox: tuple = (0, 0, 0, 0)
    box: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    targets: dict = field(default_factory=dict)   # ingredient -> DB "Target Active Ingredient" (only when different)

    @property
    def label(self) -> str:
        """Brand name used in the report (generic name when no brand is recognised)."""
        if self.brand:
            return self.brand
        if self.ingredients:
            return "/".join(pretty(i) for i in self.ingredients) + " (brand not read)"
        return "Unidentified package"

    @property
    def tag(self) -> str:
        return f"{self.label} [#{self.pkg_id}]"


def _fmt_hits(hits) -> str:
    return ", ".join(f"'{h.term.display}'" + (f" {h.strength}" if h.strength else "") for h in hits)


def read_package(kb: KnowledgeBase, pkg_id: int, tokens: list[tuple[str, float]]) -> Package:
    hits = find_hits(kb, tokens)
    ocr_text = " ".join(t for t, _ in tokens)
    brand_hits = sorted([h for h in hits if h.term.kind == "brand"], key=lambda h: -h.score)
    gen_hits = [h for h in hits if h.term.kind in ("generic", "ext")]
    notes: list[str] = []

    # printed generics: those followed by a strength are the pack's actives; otherwise the single best one
    with_strength = [h for h in gen_hits if h.strength]
    if with_strength:
        printed = sorted(with_strength, key=lambda h: -h.score)[:3]
    else:
        core = sorted([h for h in gen_hits if h.term.kind == "generic" and h.score >= 0.70], key=lambda h: -h.score)
        ext = sorted([h for h in gen_hits if h.term.kind == "ext" and h.score >= 0.75], key=lambda h: -h.score)
        # no strength printed: every confidently read ingredient name (a combination pack names several), else the best one
        printed = ([h for h in core if h.score >= 0.85][:3] or core[:1]) if core else ext[:1]
    printed_ings = [i for h in printed for i in h.term.ingredients]

    brand = brand_hits[0] if brand_hits else None
    ingredients: list[str] = []
    strengths: dict[str, str] = {}
    targets: dict[str, str] = {}
    how_parts: list[str] = []
    if brand:
        t = brand.term
        how_parts.append(f"brand '{t.display}' ({'DB brand table' if t.source == 'db' else 'brand_aliases.csv'})")
        # which DB formulation of this brand?  the smallest one containing everything printed on the pack;
        # with nothing printed, the formulation the DB lists most often.
        fits = [v for v in t.variants if set(printed_ings) <= set(v[0])] if printed_ings else list(t.variants)
        if printed_ings and not fits:
            listed = " / ".join("+".join(map(pretty, v[0])) for v in t.variants[:3])
            shown = ", ".join(map(pretty, sorted(set(printed_ings))))
            if brand.exact:
                notes.append(f"brand '{t.display}' is listed in the DB as {listed} but the pack text shows {shown} "
                             "- using the printed text")
            else:                                          # loose brand match contradicted by the printed ingredient
                notes.append(f"possible brand '{t.display}' ignored: the DB lists it as {listed}, the pack shows {shown}")
                brand = None
                how_parts.clear()
            ingredients = list(printed_ings)
        else:
            chosen = (min(fits, key=lambda v: (len(v[0]), -v[1])) if printed_ings else fits[0])[0]
            ingredients = list(chosen) + [i for h in printed if h.strength for i in h.term.ingredients if i not in chosen]
            others = [v for v in t.variants if v[0] != chosen]
            if others and not printed_ings:
                notes.append("formulation taken from the most common DB entry for this brand; other "
                             f"'{t.display}' products contain: "
                             + " | ".join("+".join(map(pretty, v[0])) for v in others[:4]))
            for ing in ingredients:
                if ing in t.targets:
                    targets[ing] = t.targets[ing]
        if printed:
            how_parts.append("printed " + _fmt_hits(printed))
    elif printed:
        ingredients = list(printed_ings)
        how_parts.append("printed " + _fmt_hits(printed))
    ingredients = list(dict.fromkeys(ingredients))
    for h in printed:
        for i in h.term.ingredients:
            if h.strength and i not in strengths:
                strengths[i] = h.strength
    if brand and not strengths and brand.strength and len(ingredients) == 1:   # strength printed beside the brand
        strengths[ingredients[0]] = brand.strength
    if brand and len(brand_hits) > 1 and brand_hits[1].term.ingredients != brand.term.ingredients \
            and brand_hits[1].score >= 0.8:
        notes.append(f"second brand word also seen: '{brand_hits[1].term.display}'")
    for ing, tg in targets.items():
        notes.append(f"DB lists this brand under target ingredient {pretty(tg)}, its scientific name is {pretty(ing)}")

    status = "identified" if ingredients else "unidentified"
    return Package(pkg_id, brand.term.display if brand else None, ingredients, strengths, status,
                   " + ".join(how_parts) if how_parts else "no known brand or generic name read",
                   ocr_text, notes=notes, targets=targets)


# ============================================================================
# 4. Duplicates and interactions
# ============================================================================
def _num(strength: str) -> Optional[tuple[float, str]]:
    m = re.match(r"([\d.]+)\s*(\S+)", strength or "")
    return (float(m.group(1)), m.group(2)) if m else None


def find_duplicates(pkgs: list[Package]) -> list[dict]:
    """Same scientific name in >= 2 packages.  Also 'related': different scientific names that the DB files
    under the same target ingredient (e.g. esomeprazole / omeprazole) - flagged as possible duplicate therapy."""
    by_ing: dict[str, list[Package]] = defaultdict(list)
    for p in pkgs:
        for ing in dict.fromkeys(p.ingredients):
            by_ing[ing].append(p)
    out = []
    for ing, plist in by_ing.items():
        if len(plist) < 2:
            continue
        nums = [_num(p.strengths.get(ing, "")) for p in plist]
        combined = ""
        if all(nums) and len({u for _, u in nums}) == 1:
            combined = f"{sum(v for v, _ in nums):g} {nums[0][1]}"
        out.append({
            "kind": "duplicate",
            "ingredient": ing,
            "flag": "INCREASED DOSAGE - same active ingredient in more than one package",
            "packages": [{"pkg_id": p.pkg_id, "brand": p.label, "strength": p.strengths.get(ing, "")} for p in plist],
            "combined_single_dose_if_taken_together": combined,
        })
    by_target: dict[str, list[tuple[Package, str]]] = defaultdict(list)
    for p in pkgs:
        for ing in dict.fromkeys(p.ingredients):
            by_target[p.targets.get(ing, ing)].append((p, ing))
    for tg, plist in by_target.items():
        names = {ing for _, ing in plist}
        if len({p.pkg_id for p, _ in plist}) >= 2 and len(names) >= 2:
            out.append({
                "kind": "related",
                "ingredient": tg,
                "flag": "POSSIBLE DUPLICATE THERAPY - different scientific names filed under the same DB target ingredient",
                "packages": [{"pkg_id": p.pkg_id, "brand": p.label, "strength": p.strengths.get(ing, ""),
                              "scientific_name": ing} for p, ing in plist],
                "combined_single_dose_if_taken_together": "",
            })
    return sorted(out, key=lambda d: (d["kind"], d["ingredient"]))


def check_interactions(kb: KnowledgeBase, pkgs: list[Package]) -> tuple[list[dict], list[dict], list[dict]]:
    """Return (interactions, no_record, not_assessable) - one row per (package pair, ingredient pair).

    The DB holds the COMPLETE interaction list of its core drugs (kb.complete), so a pair with at least one such drug and
    no entry is 'no interaction recorded'; a pair with none of them cannot be assessed."""
    found, no_rec, not_ass = [], [], []
    for a, b in itertools.combinations(pkgs, 2):
        for ia in a.ingredients:
            for ib in b.ingredients:
                if ia == ib:
                    continue                                 # that is a duplicate, reported separately
                row = {"pkg_a": a.pkg_id, "brand_a": a.label, "ingredient_a": ia,
                       "pkg_b": b.pkg_id, "brand_b": b.label, "ingredient_b": ib}
                info = kb.pairs.get(frozenset((ia, ib)))
                if info:
                    row.update(risk=info.risk,
                               db_entries=[{"drug_a": d1, "drug_b": d2, "risk": r} for d1, d2, r in info.entries],
                               risk_text=RISK_LABEL[info.risk])
                    found.append(row)
                elif {ia, ib} & kb.complete:
                    no_rec.append(row)
                else:
                    not_ass.append(row)
    found.sort(key=lambda r: (-RISK_ORDER[r["risk"]], r["pkg_a"], r["pkg_b"]))
    return found, no_rec, not_ass


# Segmentation: drug_identifier's validated defaults first.  A second, more sensitive pass (lower Canny
# floors) is run too, and ONLY packs it finds that do not overlap a first-pass pack are added - so low-contrast or
# JPEG-compressed packs are rescued without disturbing crops that already work (lowering the floors for
# everything made a glare-covered real pack unreadable).
APP_CONFIG = di.Config()
SENSITIVE_CONFIG = di.Config(canny_hi_min=45.0, chroma_hi_min=35.0)


def segment_with_rescue(bgr: np.ndarray, cfg: di.Config) -> list:
    items = di.segment_items(bgr, cfg)
    if cfg is not APP_CONFIG:                       # caller supplied a custom config: respect it as-is
        return items
    extra = []
    for it in di.segment_items(bgr, SENSITIVE_CONFIG):
        x, y, w, h = it.bbox
        covered = False
        for old in items:
            ox, oy, ow, oh = old.bbox
            iw = max(0, min(x + w, ox + ow) - max(x, ox))
            ih = max(0, min(y + h, oy + oh) - max(y, oy))
            if iw * ih >= 0.3 * min(w * h, ow * oh):
                covered = True
                break
        if not covered:
            extra.append(it)
    if extra:
        log.info("rescue pass added %d package(s)", len(extra))
        H = bgr.shape[0]
        items = sorted(items + extra, key=lambda it: (it.bbox[1] // max(1, H // 6), it.bbox[0]))
        for i, it in enumerate(items, 1):
            it.item_id = i
    return items


# ============================================================================
# 5. Whole pipeline
# ============================================================================
def rescue_ocr(ocr: di.OCREngine, item: di.Item) -> list[tuple[str, float]]:
    """Extra OCR for a pack whose brand was not recognised.  drug_identifier enlarges crops before OCR, which also enlarges
    sensor noise; reading the crop at its own size, plain and median-filtered, often recovers a brand that the first pass lost."""
    if ocr.name == "none":
        return []
    src = item.upright if (item.shape == "rectangular" and item.upright is not None) else item.crop
    gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    out: list[tuple[str, float]] = []
    for img in (gray, cv2.medianBlur(gray, 5)):
        out += ocr.read(cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_REPLICATE))
    return out


def analyse(image_path: str | Path, kb: KnowledgeBase, engine: str = "auto",
            cfg: Optional[di.Config] = None, ocr: Optional[di.OCREngine] = None,
            patient: Optional[Patient] = None) -> dict:
    cfg = cfg or APP_CONFIG
    bgr = di.load_image(image_path, cfg.max_side)
    items = segment_with_rescue(bgr, cfg)
    if not items:                                           # nothing separable -> whole photo is one item
        h, w = bgr.shape[:2]
        cnt = np.array([[[0, 0]], [[w - 1, 0]], [[w - 1, h - 1]], [[0, h - 1]]], np.int32)
        items = [di.Item(1, (0, 0, w, h), bgr.copy(), np.full((h, w), 255, np.uint8), cnt)]
    ocr = ocr or di.OCREngine(engine)
    pkgs: list[Package] = []
    for it in items:
        it.shape = di.classify_shape(it.contour)
        di.ocr_item(ocr, it, cfg)
        p = read_package(kb, it.item_id, it.ocr_tokens)
        if p.brand is None:                                  # brand not read: one cheap extra look at the un-enlarged crop
            extra = rescue_ocr(ocr, it)
            if extra:
                p2 = read_package(kb, it.item_id, it.ocr_tokens + extra)
                if p2.brand is not None:
                    p = p2
                    p.notes.append("brand found by the extra OCR pass (un-enlarged / median-filtered crop)")
        p.bbox = tuple(int(v) for v in it.bbox)
        p.box = cv2.boxPoints(cv2.minAreaRect(it.contour)).astype(int).tolist()
        pkgs.append(p)
    dups = find_duplicates(pkgs)
    found, no_rec, not_ass = check_interactions(kb, pkgs)
    pat = screen_patient(kb.rules, pkgs, patient) if patient and not patient.empty else None
    return {"image": str(image_path), "ocr_engine": ocr.name, "packages": pkgs,
            "duplicates": dups, "interactions": found, "no_record": no_rec,
            "not_assessable": not_ass, "patient": pat, "_bgr": bgr}


# ============================================================================
# 6. Output: text report, JSON, annotated image
# ============================================================================
def _pk(r: dict, side: str) -> str:
    return f"{r['brand_' + side]} [#{r['pkg_' + side]}]"


def format_report(res: dict, kb: KnowledgeBase) -> str:
    L: list[str] = []
    pk = res["packages"]
    L.append("=" * 78)
    L.append(f" MEDICINE INTERACTION REPORT   image: {Path(res['image']).name}   packages found: {len(pk)}")
    L.append("=" * 78)
    n_unid = sum(1 for p in pk if not p.ingredients)
    n_na = len({(r["pkg_a"], r["pkg_b"]) for r in res["not_assessable"]})
    n_dup = sum(1 for d in res["duplicates"] if d["kind"] == "duplicate")
    n_rel = sum(1 for d in res["duplicates"] if d["kind"] == "related")
    L.append(f" SUMMARY: {n_dup} duplicate ingredient(s)" + (f" (+{n_rel} possible)" if n_rel else "")
             + f" | {len(res['interactions'])} interaction(s) "
             f"| {n_na} package pair(s) not assessable | {n_unid} unidentified package(s)"
             + (f" | {sum(1 for a in res['patient']['alerts'] if a['severity'] == 'CONTRAINDICATED')} patient contraindication(s), "
                f"{sum(1 for a in res['patient']['alerts'] if a['severity'] != 'CONTRAINDICATED')} other patient alert(s)"
                if res.get("patient") else ""))

    L.append("\n1. PACKAGES DETECTED  (brand -> scientific name found in the database)")
    for p in pk:
        if p.ingredients:
            ings = "; ".join(pretty(i) + (f" {p.strengths[i]}" if i in p.strengths else "") for i in p.ingredients)
        else:
            ings = "-"
        L.append(f"   #{p.pkg_id:<2} {p.label:<26} {ings:<36} [{p.how}]")
        for n in p.notes:
            L.append(f"        note: {n}")
        if not p.ingredients:
            L.append(f"        OCR text: {p.ocr_text[:90] or '(nothing readable)'}")

    L.append("\n2. DUPLICATE ACTIVE INGREDIENTS  (same scientific name in more than one package)")
    if not res["duplicates"]:
        L.append("   none")
    for d in res["duplicates"]:
        who = " + ".join(f"{x['brand']} [#{x['pkg_id']}]" + (f" ({x['strength']})" if x['strength'] else "")
                         + (f" = {pretty(x['scientific_name'])}" if d["kind"] == "related" else "")
                         for x in d["packages"])
        if d["kind"] == "duplicate":
            L.append(f"   !! {pretty(d['ingredient']).upper()}  ->  INCREASED DOSAGE: present in {who}")
            if d["combined_single_dose_if_taken_together"]:
                L.append(f"      one unit of each taken together = {d['combined_single_dose_if_taken_together']} "
                         f"of {pretty(d['ingredient'])}")
        else:
            L.append(f"   ~  possible duplicate therapy (DB target ingredient {pretty(d['ingredient'])}): {who}")

    L.append("\n3. INTERACTIONS FOUND  (risk as written in the database)")
    inter = res["interactions"]
    if not inter:
        L.append("   none recorded between the packages in the photo")
    last = None
    for r in inter:
        if r["risk"] != last:
            L.append(f"   --- {r['risk_text']} ---")
            last = r["risk"]
        L.append(f"   * {_pk(r, 'a')} ({pretty(r['ingredient_a'])})  <->  {_pk(r, 'b')} ({pretty(r['ingredient_b'])})")
        if len({e["risk"] for e in r["db_entries"]}) > 1 or any("(" in e["drug_a"] + e["drug_b"] for e in r["db_entries"]):
            L.append("       DB rows: " + "; ".join(f"{e['drug_a']} + {e['drug_b']} = {e['risk']}" for e in r["db_entries"]))

    L.append("\n4. BY MEDICINE  (each medicine, by brand, with the medicines it interacts with)")
    per: dict[int, list] = defaultdict(list)
    for r in inter:
        per[r["pkg_a"]].append((r["brand_b"], r["pkg_b"], r["risk"], r["ingredient_a"], r["ingredient_b"]))
        per[r["pkg_b"]].append((r["brand_a"], r["pkg_a"], r["risk"], r["ingredient_b"], r["ingredient_a"]))
    for p in pk:
        L.append(f"   {p.tag}  - {', '.join(pretty(i) for i in p.ingredients) or 'not identified'}")
        rows = per.get(p.pkg_id, [])
        if not rows:
            na = {(r["pkg_b"] if r["pkg_a"] == p.pkg_id else r["pkg_a"]) for r in res["not_assessable"]
                  if p.pkg_id in (r["pkg_a"], r["pkg_b"])}
            others = len(pk) - 1
            L.append("       (no interaction recorded with the other packages"
                     + (f"; {len(na)} of {others} pair(s) could not be assessed - no drug with a complete list in the pair)" if na else ")"))
        for b, bid, risk, mine, other in sorted(rows, key=lambda x: (-RISK_ORDER[x[2]], x[1])):
            risk_txt = risk if risk != "Unknown" else "risk not specified"
            L.append(f"       <-> {b} [#{bid}]  ({pretty(mine)} + {pretty(other)})  : {risk_txt}")

    L += format_patient_section(res.get("patient"))

    L.append("\n6. COVERAGE  (what the database could and could not check)")
    def pair_names(rows):
        seen = dict.fromkeys((r["pkg_a"], r["pkg_b"], r["brand_a"], r["brand_b"]) for r in rows)
        return [f"{a} [#{x}] / {b} [#{y}]" for x, y, a, b in seen]
    if res["no_record"]:
        L.append("   Checked, no interaction recorded (at least one drug of the pair is a core drug with a complete list):")
        for t in pair_names(res["no_record"]):
            L.append(f"      - {t}")
    if res["not_assessable"]:
        names = pair_names(res["not_assessable"])
        L.append(f"   NOT ASSESSABLE ({len(names)} pair(s)) - neither drug has a complete list in the database "
                 "(core drugs only); this is NOT a 'safe' result:")
        line = "      "
        for t in names:
            if len(line) + len(t) > 100:
                L.append(line.rstrip(" ;"))
                line = "      "
            line += t + ";  "
        L.append(line.rstrip(" ;"))
    if not res["no_record"] and not res["not_assessable"]:
        L.append("   every identified pair had a database entry")
    L.append(f"   Database: {kb.n_interaction_rows:,} interaction rows; complete lists for {len(kb.complete)} ingredients "
             f"({', '.join(pretty(x) for x in sorted(kb.complete))}).")
    thin = [i for p in pk for i in p.ingredients if i in kb.complete and kb.pair_count[i] < 0.25 * kb.median_pairs]
    for i in dict.fromkeys(thin):
        L.append(f"   DATA CAUTION: the database lists only {kb.pair_count[i]} interactions for {pretty(i)} "
                 f"(typical drug: ~{kb.median_pairs}) - its list may be incomplete, so 'no record' is weaker evidence here.")

    L.append("\nDISCLAIMER: educational prototype. Verify every medicine with a pharmacist or the official label.")
    return "\n".join(L)


def to_json(res: dict) -> dict:
    d = {k: v for k, v in res.items() if not k.startswith("_")}
    d["packages"] = [asdict(p) | {"label": p.label} for p in res["packages"]]
    return d


def annotate(res: dict) -> np.ndarray:
    vis = res["_bgr"].copy()
    worst: dict[int, str] = {}
    for r in res["interactions"]:
        for k in ("pkg_a", "pkg_b"):
            if r[k] not in worst or RISK_ORDER[r["risk"]] > RISK_ORDER[worst[r[k]]]:
                worst[r[k]] = r["risk"]
    dup_ids = {x["pkg_id"] for d in res["duplicates"] for x in d["packages"]}
    pat_ids = {a["pkg_id"] for a in (res.get("patient") or {}).get("alerts", []) if a["severity"] == "CONTRAINDICATED"}
    colour = {"Major": (0, 0, 220), "Moderate": (0, 140, 255), "Minor": (0, 200, 220), "Unknown": (200, 120, 0)}
    for p in res["packages"]:
        col = colour.get(worst.get(p.pkg_id, ""), (0, 170, 0) if p.status == "identified" else (120, 120, 120))
        cv2.polylines(vis, [np.array(p.box, np.int32)], True, col, 4, cv2.LINE_AA)
        x, y, w, h = p.bbox
        label = f"#{p.pkg_id} {p.label}" + ("  [DUPLICATE]" if p.pkg_id in dup_ids else "") \
            + ("  [PATIENT ALERT]" if p.pkg_id in pat_ids else "")
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(vis, (x, max(0, y - th - 10)), (x + tw + 8, y), col, -1)
        cv2.putText(vis, label, (x + 4, max(th, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    legend = [("Major", "Major"), ("Moderate", "Moderate"), ("Minor", "Minor"),
              ("Unknown", "risk not specified")]
    x = 12
    H = vis.shape[0]
    cv2.rectangle(vis, (0, H - 34), (vis.shape[1], H), (25, 25, 25), -1)
    for key, text in legend + [("", "no interaction recorded")]:
        c = colour.get(key, (0, 170, 0))
        cv2.rectangle(vis, (x, H - 24), (x + 16, H - 10), c, -1)
        cv2.putText(vis, text, (x + 22, H - 11), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)
        x += 40 + 9 * len(text)
    return vis


def save_outputs(res: dict, kb: KnowledgeBase, out: Path) -> str:
    out.mkdir(parents=True, exist_ok=True)
    text = format_report(res, kb)
    (out / "report.txt").write_text(text, encoding="utf-8")
    (out / "report.json").write_text(json.dumps(to_json(res), indent=2, default=str), encoding="utf-8")
    cv2.imwrite(str(out / "annotated.png"), annotate(res))
    return text


# ============================================================================
# 8. CLI
# ============================================================================
def add_patient_args(p) -> None:
    g = p.add_argument_group("patient profile (optional - turns on the age / sex / disease / allergy screen)")
    g.add_argument("--patient", help="JSON file: {age, sex, pregnant, breastfeeding, ancestry, conditions[], allergies[]}")
    g.add_argument("--age", type=float)
    g.add_argument("--sex", choices=["F", "M", "f", "m", "female", "male"])
    g.add_argument("--pregnant", choices=["yes", "no"])
    g.add_argument("--breastfeeding", action="store_true")
    g.add_argument("--ancestry", help="e.g. asian (one rosuvastatin rule depends on it)")
    g.add_argument("--conditions", help='comma-separated, e.g. "kidney disease, peptic ulcer, high blood pressure"')
    g.add_argument("--allergies", help='comma-separated, e.g. "penicillin, aspirin, lactose"')


def patient_from_args(a) -> Optional[Patient]:
    pt = Patient.from_json(a.patient) if a.patient else Patient()
    if a.age is not None:
        pt.age = a.age
    if a.sex:
        pt.sex = Patient(sex=a.sex).sex
    if a.pregnant:
        pt.pregnant = a.pregnant == "yes"
    if a.breastfeeding:
        pt.breastfeeding = True
    if a.ancestry:
        pt.ancestry = a.ancestry
    if a.conditions:
        pt.conditions = Patient(conditions=a.conditions).conditions
    if a.allergies:
        pt.allergies = Patient(allergies=a.allergies).allergies
    return None if pt.empty else pt


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Medicine-package photo -> duplicates + interactions")
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--db", default=str(DEFAULT_DB))
        p.add_argument("--aliases", default=str(DEFAULT_ALIASES))
        p.add_argument("--engine", default="tesseract", choices=["auto", "easyocr", "tesseract"])

    c = sub.add_parser("check", help="analyse one photo")
    c.add_argument("image")
    c.add_argument("--out", default="results")
    c.add_argument("--json", action="store_true", help="print JSON instead of the text report")
    common(c)
    add_patient_args(c)


    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if a.verbose else logging.WARNING, format="%(levelname)s %(message)s")
    kb = KnowledgeBase(a.db, a.aliases)

    if a.cmd == "check":
        res = analyse(a.image, kb, engine=a.engine, patient=patient_from_args(a))
        text = save_outputs(res, kb, Path(a.out))
        print(json.dumps(to_json(res), indent=2, default=str) if a.json else text)
        print(f"\n[saved report.txt, report.json, annotated.png in {a.out}/]")
        return 0

if __name__ == "__main__":
    sys.exit(main())
