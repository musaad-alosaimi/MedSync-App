import { Bi, HealthProfile, Medication, SafetyAlert, Severity } from '../models';
import {
  ADVICE,
  AGE_REASONS,
  AGE_RULES,
  ALLERGY_OPTIONS,
  ALLERGY_TEXT,
  CHRONIC_CONDITIONS,
  CLASS_NAMES,
  CONDITION_REASONS,
  CONDITION_RULES,
  DUPLICATE_REASONS,
  INTERACTIONS,
  INTERACTION_REASONS,
  KbDrug,
  LONGTERM_REASONS,
  LONGTERM_RULES,
  POLYPHARMACY_TEXT,
  Reason,
  UNVERIFIED_TEXT,
  findDrug,
} from './knowledge-base';

export const SEVERITY_ORDER: Record<Severity, number> = { major: 0, moderate: 1, minor: 2 };

interface Ctx {
  med: Medication;
  kb?: KbDrug;
  tags: string[];
}

function fill(tpl: Bi, vars: Record<string, string | Bi>): Bi {
  const out: Bi = { ar: tpl.ar, en: tpl.en };
  for (const lang of ['ar', 'en'] as const) {
    out[lang] = tpl[lang].replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      if (v === undefined) return `{${k}}`;
      // Isolate Latin medicine names inside Arabic sentences so neighbouring punctuation/letters don't reorder.
      if (typeof v === 'string') return lang === 'ar' && /[A-Za-z]/.test(v) ? `\u2068${v}\u2069` : v;
      return v[lang];
    });
  }
  return out;
}

function make(
  kind: SafetyAlert['kind'],
  severity: Severity,
  medIds: string[],
  key: string,
  reason: Reason | { title: Bi; text: Bi },
  vars: Record<string, string | Bi>,
): SafetyAlert {
  return {
    id: `${kind}:${[...medIds].sort().join('+')}:${key}`,
    severity,
    kind,
    medIds,
    title: reason.title,
    message: fill(reason.text, vars),
    advice: ADVICE[severity],
  };
}

function daysSince(iso: string, today: Date): number {
  const start = new Date(iso + 'T00:00:00');
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
}

/**
 * Analyse the ACTIVE medications of a patient together with their health profile.
 * Pure function: same input -> same output, no I/O.
 */
export function analyze(meds: Medication[], profile: HealthProfile, today = new Date()): SafetyAlert[] {
  const active = meds.filter((m) => m.active);
  const ctx: Ctx[] = active.map((med) => {
    const kb = findDrug(med.kbId);
    return { med, kb, tags: kb?.tags ?? [] };
  });
  const alerts: SafetyAlert[] = [];
  const nameOf = (c: Ctx) => c.med.name;

  // 1. Duplicates ---------------------------------------------------------
  const pairHasRule = new Set<string>();
  const pairKey = (x: Ctx, y: Ctx) => [x.med.id, y.med.id].sort().join('|');

  const byIngredient = new Map<string, Ctx[]>();
  for (const c of ctx) {
    const key = c.kb?.id ?? `name:${c.med.name.trim().toLowerCase()}`;
    byIngredient.set(key, [...(byIngredient.get(key) ?? []), c]);
  }
  for (const [key, group] of byIngredient) {
    if (group.length > 1) {
      alerts.push(
        make('duplicate', 'major', group.map((g) => g.med.id), `ingredient:${key}`, DUPLICATE_REASONS.ingredient, {
          a: nameOf(group[0]),
        }),
      );
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) pairHasRule.add(pairKey(group[i], group[j]));
    }
  }

  // 2. Interactions -------------------------------------------------------
  for (let i = 0; i < ctx.length; i++) {
    for (let j = i + 1; j < ctx.length; j++) {
      const x = ctx[i];
      const y = ctx[j];
      if (!x.kb || !y.kb || x.kb.id === y.kb.id) continue;
      let best: { sev: Severity; reason: string; a: Ctx; b: Ctx } | undefined;
      for (const r of INTERACTIONS) {
        let a: Ctx | undefined;
        let b: Ctx | undefined;
        if (x.tags.includes(r.a) && y.tags.includes(r.b)) [a, b] = [x, y];
        else if (y.tags.includes(r.a) && x.tags.includes(r.b)) [a, b] = [y, x];
        if (!a || !b) continue;
        if (!best || SEVERITY_ORDER[r.sev] < SEVERITY_ORDER[best.sev]) best = { sev: r.sev, reason: r.reason, a, b };
      }
      if (best) {
        pairHasRule.add(pairKey(x, y));
        const reason = INTERACTION_REASONS[best.reason];
        alerts.push(
          make('interaction', best.sev, [x.med.id, y.med.id], best.reason, reason, {
            a: nameOf(best.a),
            b: nameOf(best.b),
          }),
        );
      }
    }
  }

  // 2b. Same-class duplicates without a more specific rule
  for (let i = 0; i < ctx.length; i++) {
    for (let j = i + 1; j < ctx.length; j++) {
      const x = ctx[i];
      const y = ctx[j];
      if (!x.kb?.cls || x.kb.cls !== y.kb?.cls || x.kb.id === y.kb.id) continue;
      if (pairHasRule.has(pairKey(x, y))) continue;
      const cls = CLASS_NAMES[x.kb.cls] ?? { en: x.kb.cls, ar: x.kb.cls };
      alerts.push(
        make('duplicate', 'moderate', [x.med.id, y.med.id], `cls:${x.kb.cls}`, DUPLICATE_REASONS.cls, {
          a: nameOf(x),
          b: nameOf(y),
          c: cls,
        }),
      );
    }
  }

  // 3. Allergies ----------------------------------------------------------
  for (const allergyId of profile.allergies) {
    const custom = allergyId.startsWith('custom:') ? allergyId.slice(7).trim().toLowerCase() : null;
    const opt = ALLERGY_OPTIONS.find((o) => o.id === allergyId);
    const label: Bi = opt ? { en: opt.en, ar: opt.ar } : { en: custom ?? allergyId, ar: custom ?? allergyId };
    for (const c of ctx) {
      let hit = false;
      if (opt) hit = opt.matchTags.some((t) => c.tags.includes(t));
      else if (custom && custom.length >= 3) {
        hit =
          c.med.name.toLowerCase().includes(custom) ||
          !!c.kb?.keys.some((k) => k === custom) ||
          !!c.kb?.cls && (CLASS_NAMES[c.kb.cls]?.en.toLowerCase().includes(custom) ?? false);
      }
      if (hit) {
        const sev: Severity = opt?.weak ? 'minor' : 'major';
        alerts.push(
          make('allergy', sev, [c.med.id], `allergy:${allergyId}`, { title: ALLERGY_TEXT.title, text: opt?.weak ? ALLERGY_TEXT.weak : ALLERGY_TEXT.strong }, {
            a: nameOf(c),
            x: label,
          }),
        );
      }
    }
  }

  // 4. Age ----------------------------------------------------------------
  const age = profile.age;
  if (age !== null && age !== undefined) {
    for (const c of ctx) {
      let best: { sev: Severity; reason: string } | undefined;
      for (const r of AGE_RULES) {
        if (!c.tags.includes(r.match)) continue;
        if (r.min !== undefined && age < r.min) continue;
        if (r.max !== undefined && age > r.max) continue;
        if (!best || SEVERITY_ORDER[r.sev] < SEVERITY_ORDER[best.sev]) best = { sev: r.sev, reason: r.reason };
      }
      if (best) {
        alerts.push(make('age', best.sev, [c.med.id], best.reason, AGE_REASONS[best.reason], { a: nameOf(c) }));
      }
    }
  }

  // 5. Chronic conditions ---------------------------------------------------
  for (const condId of profile.chronic) {
    const cond = CHRONIC_CONDITIONS.find((x) => x.id === condId);
    if (!cond) continue;
    for (const c of ctx) {
      let best: { sev: Severity; reason: string } | undefined;
      for (const r of CONDITION_RULES) {
        if (r.cond !== condId || !c.tags.includes(r.match)) continue;
        if (!best || SEVERITY_ORDER[r.sev] < SEVERITY_ORDER[best.sev]) best = { sev: r.sev, reason: r.reason };
      }
      if (best) {
        alerts.push(
          make('condition', best.sev, [c.med.id], `${condId}:${best.reason}`, CONDITION_REASONS[best.reason], {
            a: nameOf(c),
            c: { en: cond.en, ar: cond.ar },
          }),
        );
      }
    }
  }

  // 6. Long-term use --------------------------------------------------------
  for (const c of ctx) {
    const days = daysSince(c.med.startDate, today);
    let best: { sev: Severity; reason: string } | undefined;
    for (const r of LONGTERM_RULES) {
      if (!c.tags.includes(r.match) || days < r.minDays) continue;
      if (!best || SEVERITY_ORDER[r.sev] < SEVERITY_ORDER[best.sev]) best = { sev: r.sev, reason: r.reason };
    }
    if (best) {
      alerts.push(make('longterm', best.sev, [c.med.id], best.reason, LONGTERM_REASONS[best.reason], { a: nameOf(c), d: String(days) }));
    }
  }

  // 7. Polypharmacy -----------------------------------------------------------
  if (ctx.length >= 5) {
    const sev: Severity = ctx.length >= 10 ? 'moderate' : 'minor';
    alerts.push(make('polypharmacy', sev, [], 'count', POLYPHARMACY_TEXT, { n: String(ctx.length) }));
  }

  // 8. Unverified (not in KB) ---------------------------------------------------
  for (const c of ctx) {
    if (!c.kb) alerts.push(make('unverified', 'minor', [c.med.id], 'unverified', UNVERIFIED_TEXT, { a: nameOf(c) }));
  }

  return alerts.sort((p, q) => SEVERITY_ORDER[p.severity] - SEVERITY_ORDER[q.severity]);
}

export function summarize(alerts: SafetyAlert[]): Record<Severity, number> {
  const out: Record<Severity, number> = { major: 0, moderate: 0, minor: 0 };
  for (const a of alerts) out[a.severity]++;
  return out;
}
