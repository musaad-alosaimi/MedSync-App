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

## Demo path

1. Onboarding → Create account → complete health profile (age, conditions, allergies).
2. Home → **Take a photo** → on desktop use **Try a demo set** (or choose any photo).
3. Confirm detected medicines → Home shows the conflict pop-up → **More information** → full safety report.
4. Add one manually from the *Add medicine* tab (5-step wizard), toggle active/inactive in *My medicines*.

## Architecture

```
src/app/core/
  safety/knowledge-base.ts   drugs, classes, interaction/age/condition/long-term rules, bilingual texts
  safety/safety-engine.ts    pure analyze(meds, profile) -> SafetyAlert[]   (unit-tested)
  recognition/               OCR (Tesseract.js) + name matcher; swap `identify()` for a server vision model
  *.service.ts               auth, profile, medications, safety, monthly review, i18n, storage
src/app/pages/               onboarding, login, register, profile-setup, tabs (home/meds/add/settings),
                             scan, scan-review, add-med (wizard), safety
```

## What is real vs. placeholder

| Area | Status |
| --- | --- |
| Safety engine | Real, rule-based, offline. **Knowledge base is illustrative (~45 items)** — must be replaced/reviewed by a clinical pharmacist and a licensed source before any real use. |
| Photo recognition | Best-effort on-device OCR + brand/ingredient matching. Works on clear, close photos; weak on crowded shelves / small print. The user always confirms results. Needs internet the first time (OCR engine + language data download). |
| Accounts | **Local only** (salted SHA-256 in device storage). Apple/Google buttons sign in a demo user. Replace `AuthService` with a real backend. |
| Monthly review | In-app banner + native monthly local notification (Capacitor) on devices. |
| Data | Stored on the device (localStorage). No sync, no encryption at rest. |

MedSync supports, but does not replace, advice from a doctor or pharmacist.
