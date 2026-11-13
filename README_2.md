# Medicine-package interaction checker

Take **one photo of medicine packages** and get back, for every box: its brand and scientific name, whether the same
active ingredient appears twice, every drug-drug interaction between the boxes (with risk level, listed by brand name),
and - if you describe the patient - the age, sex / pregnancy, disease and allergy warnings that apply to each medicine.

Reference data: `Clinical_Safety_Database_MultiSource_v4.xlsx` (all medical content comes from this workbook).

> **Version note.** This is the final version of the program. It grew out of several earlier prototypes: a package
> finder / OCR reader (`drug_identifier.py`, which is still the image front end), a first interaction checker built on an
> earlier, smaller version of the database, and a standalone medication-safety screen. The current program merges them and
> is built on the v4 database (full brand list and full interaction lists). Nothing from the earlier prototypes needs to be run.

## Files
| file | what it is |
|---|---|
| `interaction_checker.py` | the app (command: `check`) |
| `patient_screen.py` | the age / sex / pregnancy / disease / allergy screen (imported by the app) |
| `drug_identifier.py` | package segmentation + OCR, imported by the app |
| `Clinical_Safety_Database_MultiSource_v4.xlsx` | reference database. Sheets used: `Drugs` (34 core drugs), `Brands_By_Active_Ingredient` (2,065 product rows), `Drug_InterActions` (15,228 rows), `Drug_Disease_Contraindications`, `Drug_Age_And_Sex_Rules`, `Drug_Allergies_Sensitivities` |
| `brand_aliases.csv` | small supplement for brands that are not in the database's brand sheet (Arox, Winex, TobraDex, Lactaid, Septofort, Prilosec ...). A brand in the database always wins over this file. |
| `example_output/` | example reports, including one run on a real photo and one with a patient profile |

## Install
```
pip install -r requirements.txt
```
plus the Tesseract OCR program (`apt install tesseract-ocr` or `brew install tesseract`). `easyocr` is optional (better on curved or glossy packs; use `--engine easyocr`).

## How to use
```
python interaction_checker.py check photo.jpg --out results
```
With a patient profile:
```
python interaction_checker.py check photo.jpg --out results --age 72 --sex F --conditions "peptic ulcer, chronic kidney disease, high blood pressure" --allergies "penicillin, lactose, sulfa"
python interaction_checker.py check photo.jpg --out results --patient patient.json
```
`patient.json`: `{"age": 72, "sex": "F", "pregnant": null, "breastfeeding": false, "ancestry": "asian", "conditions": ["peptic ulcer"], "allergies": ["penicillin"]}`
(`pregnant` is true / false / null for "not stated"; every field is optional.)

Output in the `--out` folder: `report.txt` (the report), `report.json` (the same data for other programs) and `annotated.png` (your photo with each box outlined in the colour of its worst interaction).

**Photo tips:** boxes flat, apart from each other, label facing up, plain contrasting surface, even light, no strong glare.

## How it works
1. **Find the packages.** Edge detection cuts the photo into individual boxes (tilted boxes are straightened). No trained model is used.
2. **Read each box.** OCR runs on several versions of each crop and in four rotations. A second, more sensitive pass adds boxes the first pass missed.
3. **Identify the medicine.** The words read are matched, allowing for OCR typos, against the database's brand table, its ingredient names and `brand_aliases.csv`.
   Text printed on the box (e.g. "Ibuprofen 400 mg") takes priority over the brand table, so an unreadable logo still resolves from the ingredient line (`Chlorhexidine (brand not read)`).
4. **Scientific name.** Taken from the database's `Scientific Formulation` column, with salts removed (`AMLODIPINE BESILATE` -> amlodipine). If a brand has several formulations
   (Panadol, Concor ...), the app picks the smallest one that contains everything printed on the box, or the most common one if nothing is printed, and says so in a note.
   Where the sheet's `Target Active Ingredient` differs (Lorius is desloratadine filed under loratadine), the product is checked by its real name and flagged as a possible duplicate therapy if it appears with the other.
5. **Duplicates.** The same scientific name in two or more boxes gives an `INCREASED DOSAGE` flag (with the summed strength when the units match).
6. **Interactions.** Every pair of boxes, and every pair of their ingredients, is looked up in `Drug_InterActions`. A pair is stored once, so the lookup works in both directions; if a pair has several rows the worst risk is kept.
7. **Patient screen** (only if a profile is given) - see below.
8. **Report** with six sections: 1 packages detected, 2 duplicate ingredients, 3 interactions sorted by risk (each with both brands), 4 the same information per medicine, 5 patient-specific alerts, 6 coverage.

### Three possible answers for a pair of medicines
The database lists complete interaction lists for its 34 core drugs and for desloratadine, levocetirizine, esomeprazole, levamlodipine and levosalbutamol (at least 100 rows each). So:
* **Interaction found** - listed with its risk (`Unknown` in the database is shown as "risk not specified").
* **No interaction recorded** - at least one of the two drugs has a complete list and the pair is not in it.
* **Not assessable** - neither drug has a complete list (for example Arox + Winex). This is never reported as "safe".

Aspirin has only 36 interaction rows in the database (a typical core drug has about 300), so the report adds a data caution: "no record" is weaker evidence for it.

## Patient screen (age, sex, pregnancy, diseases, allergies)
Section 5 of the report lists, per brand, what in the database applies to *this* patient. Without a profile the section only says how to turn it on.

* **DISEASE** - the patient's conditions against the drug's contraindications and precautions.
* **AGE** - age thresholds and groups (children, older adults, 80+, renal / cardiac / liver groups).
* **PREGNANCY** - pregnancy and breastfeeding clauses, plus a "pregnancy status not given" reminder for women aged 12-55.
* **ALLERGY** - the patient's allergy against the drug itself, its drug class and cross-reactive classes (penicillin, sulfa, NSAID, aspirin ...).
* **EXCIPIENT** - lactose, gluten, dyes etc. against the database's excipient text.

Severities, highest first: CONTRAINDICATED, WARNING, PRECAUTION, CHECK. Sex only matters for the pregnancy checks (the database has no other sex-specific rules).
Every alert quotes the database text it came from. The report also lists what it could **not** use: conditions or allergies it does not understand ("NOT screened") and medicines with no rules in the database.

**Where the matching knowledge lives.** The database rules are free text, so `patient_screen.py` contains plain tables that translate between how patients describe themselves and how the database words its rules
(`CONDITIONS`, `AGE_GROUPS`, `EXCIPIENTS`), plus drug classes and cross-reactivity (`DRUG_CLASSES`, `ALLERGENS`). Drug classes and cross-reactivity are **not** in the database; they are written into the code
for about 30 drugs, and alerts that come only from them say so. To teach the program a new disease or allergy, add an entry to these tables.

## Limits
* **Brands:** the brand table is regional and uneven (plain Advil / Tylenol are thin or missing). Use whatever the database lists (`Brufen`, `Nurofen`, `Panadol`, `Adol` ...). Brands it lacks go in `brand_aliases.csv`.
* **Patient rules cover the 34 core drugs only.** A product whose target ingredient is a core drug uses that drug's rules and says so; any other medicine prints "no rules". Allergy checks by drug class still run for those.
* **Free-text rules:** a qualifier such as "severe renal impairment" or "eGFR below 30" cannot be checked against a patient who just says "kidney disease", so those alerts say "check that the severity / type stated applies".
* **Doses** are not screened against the patient (the app does not read dose instructions).
* **Risk levels:** `Unknown` is 49% of the interaction rows - the app can say an interaction exists but not always how serious it is.
* **Photo quality:** a box whose brand cannot be read is listed as `<Ingredient> (brand not read)` when the ingredient line is legible, or as "Unidentified package" with its OCR text when only the brand is printed.
  A dark box on a dark surface can lose its brand band; heavy glare or dimming can defeat the reading.
* **Real-photo coverage:** the program was run on six real photos (Darine, Chlorhexidine, Arox, Winex, Lactaid, TobraDex). None of these is a core drug, so the disease / age / pregnancy checks on core drugs
  (Brufen, Amoxil, Glucophage ...) have been verified on rendered images only.
* **Educational prototype - not for real medication decisions.** Verify every medicine with a pharmacist or the official label.
