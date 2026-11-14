# MedSync

Ionic 9 + Angular 22 (standalone, zoneless) medication-safety app. Arabic (RTL) first, English supported.

Take one photo of all your medicines → MedSync identifies them → checks duplicates, interactions, age, allergy,
chronic-condition and long-term-use risks → shows simple alerts sorted by severity.

## Run

Requires **Node ≥ 22.22.3** (Angular CLI 22 refuses older 22.x; Node 24 LTS works).

```bash
npm install
npm start            # http://localhost:4200  (use browser devtools mobile view)
npm test             # unit tests (safety engine, matcher, auth)
npm run build        # production build -> www/
```

Native (optional): `npx cap add ios && npx cap add android && npx cap sync`.
iOS needs `NSCameraUsageDescription` in Info.plist; Android needs the `CAMERA` permission.

## Clinical API (Python) — interactions, contraindications, patient screen

The app calls the Python checker (`interaction_checker.py`, `patient_screen.py`, `drug_identifier.py`, reading
`Clinical_Safety_Database_MultiSource_v4.xlsx`) through a small FastAPI server in `server/`.

```bash
python3 -m venv server/.venv && server/.venv/bin/pip install -r server/requirements.txt   # + brew install tesseract
server/.venv/bin/uvicorn server.app:app --host 0.0.0.0 --port 8000
```

| endpoint | used by | does |
|---|---|---|
| `POST /api/check` | `SafetyService` (every change to your medicines or profile) | names + profile → duplicates, drug–drug interactions, age / sex / pregnancy / disease / allergy / excipient alerts |
| `POST /api/scan` | scan page | photo → box segmentation + OCR → the same checks, plus an annotated photo |
| `GET /api/health` | — | liveness |

* The API address is `environment.apiUrl` (`src/environments/`). On a phone use your computer's LAN IP, not `localhost`.
* **Graceful fallback:** if the API is unreachable the app keeps working with the small on-device rule set (and on-device
  Tesseract.js for photos); the safety report shows "Clinical database unreachable".
* When the API answers, its findings replace the on-device ones for every medicine it recognised. Medicines or
  profile items it cannot check are reported as **Not checked**, never as safe. Interactions the database lists without a
  severity are shown as *moderate* with an explicit "severity not specified" note.
* The profile has new **Sex and pregnancy** fields (used only for pregnancy / breastfeeding rules).
* `brand_aliases.csv` (extra brands, see `README_2.md`) is not in the repo; the server runs without it.
* Educational prototype: the database and rules are not clinically validated.

### Vision-model fallback for photos (optional)

`POST /api/scan` always runs the OpenCV + Tesseract pipeline first (free, on the server). **Only when that leaves a
package unidentified, or finds nothing,** it asks a hosted vision-language model to read the photo
(`server/vision.py`; default model `qwen3.6-flash` on Alibaba Cloud Model Studio, chosen for cost).

* Enable it: copy `server/.env.example` to `server/.env` (git-ignored) and set `MEDSYNC_VLM_API_KEY` and
  `MEDSYNC_VLM_BASE_URL`; `MEDSYNC_VLM_MODEL` changes the model; `MEDSYNC_VLM=off` disables it. Any OpenAI-compatible
  vision endpoint works.
* Medicines OCR identified are kept as they are. Unidentified OCR boxes are replaced by what the model read, skipping
  anything OCR already found. Each package in the response has `source: "ocr" | "vision"`, and `engine` is `ocr`, `vision` or `ocr+vision`.
* The model only transcribes what is printed (brand, printed ingredients, strength). That text is resolved through the
  clinical database exactly like typed names, so the database, not the model, decides every interaction and alert.
* Model output is not trusted blindly: items it only guessed, items with partly legible text, and every item in an
  over-long list (a sign of padding) are marked `low_trust` and shown **unticked** on the review screen, as are items the database does not know.
* Any failure (no key, network, bad output) keeps the OCR result. The merged result has no annotated image (box numbers would not match).
* **Privacy:** only photos OCR could not fully read are sent; they are re-encoded (location metadata removed), downscaled, and the scan screen says so.
* Offline tests (fake client, no key needed): `server/.venv/bin/python -m unittest server.test_vision -v`

## Demo path

1. Onboarding → Create account → complete health profile (age, conditions, allergies).
2. Home → **Take a photo** → on desktop use **Try a demo set** (or choose any photo).
3. Confirm detected medicines → Home shows the conflict pop-up → **More information** → full safety report.
4. Add one manually from the *Add medicine* tab (5-step wizard), toggle active/inactive in *My medicines*.
