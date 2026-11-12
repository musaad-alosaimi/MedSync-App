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
