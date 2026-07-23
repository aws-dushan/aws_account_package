import type {
  RawLine,
  CanonLine,
  ReconcileOptions,
  ReconcileResult,
  MatchResult,
  ExceptionResult,
  CategoryCode,
} from "./types";
import { CATEGORY_SEVERITY } from "./types";
import { canonicalize, round2 } from "./normalize";
import { similarity } from "./similarity";

/** Stage 3 — reversal netting within the statement (a reversal line cancels its receipt). */
function reversalNetting(statement: CanonLine[], tol: number): Set<string> {
  const netted = new Set<string>();
  for (const L of statement) {
    if (netted.has(L.key)) continue;
    if (!/\brevers/i.test(L.description)) continue;
    let best: CanonLine | undefined;
    for (const M of statement) {
      if (M.key === L.key || netted.has(M.key)) continue;
      if (Math.abs(M.magnitude - L.magnitude) > tol) continue;
      if (Math.sign(M.signed) === Math.sign(L.signed)) continue; // must be opposite
      if (M.reference && L.description.toUpperCase().includes(M.reference.toUpperCase())) {
        best = M;
        break; // explicit reference in the reversal text — strongest signal
      }
      if (!best) best = M;
    }
    if (best) {
      netted.add(L.key);
      netted.add(best.key);
    }
  }
  return netted;
}

export function reconcile(
  rawStatement: RawLine[],
  rawCustomer: RawLine[],
  opts: ReconcileOptions = {},
): ReconcileResult {
  const tol = opts.amountTolerance ?? 1;
  const fuzzy = opts.fuzzyThreshold ?? 0.8;
  const cutoff = opts.periodEnd ? Date.parse(opts.periodEnd) : NaN;

  const all = canonicalize([...rawStatement.map((r) => ({ ...r, side: "statement" as const })),
    ...rawCustomer.map((r) => ({ ...r, side: "customer" as const }))]);
  const S = all.filter((l) => l.side === "statement");
  const C = all.filter((l) => l.side === "customer");

  const netted = reversalNetting(S, tol);
  const used = new Set<string>(netted);
  const avail = (l: CanonLine) => !used.has(l.key);

  const matches: MatchResult[] = [];
  const exceptions: ExceptionResult[] = [];

  const addMatch = (
    ruleCode: MatchResult["ruleCode"],
    sKeys: CanonLine[],
    cKeys: CanonLine[],
    confidence: number,
  ) => {
    const amount = round2(sKeys.reduce((s, l) => s + l.magnitude, 0));
    const cAmount = round2(cKeys.reduce((s, l) => s + l.magnitude, 0));
    [...sKeys, ...cKeys].forEach((l) => used.add(l.key));
    matches.push({
      ruleCode,
      confidence,
      statementKeys: sKeys.map((l) => l.key),
      customerKeys: cKeys.map((l) => l.key),
      amount,
      rounding: Math.abs(amount - cAmount) > 0.005,
    });
  };

  // Pass R — exact: same normalised reference, amount within tolerance.
  for (const s of S) {
    if (!avail(s)) continue;
    const c = C.find((x) => avail(x) && x.normRef === s.normRef && Math.abs(x.magnitude - s.magnitude) < tol);
    if (c) addMatch("R", [s], [c], 1);
  }

  // Pass RA — fuzzy: reference similarity ≥ threshold, amount within tolerance.
  for (const s of S) {
    if (!avail(s)) continue;
    let best: CanonLine | undefined;
    let bestSim = fuzzy;
    for (const c of C) {
      if (!avail(c)) continue;
      if (Math.abs(c.magnitude - s.magnitude) >= tol) continue;
      const sim = similarity(s.normRef, c.normRef);
      if (sim >= bestSim) {
        bestSim = sim;
        best = c;
      }
    }
    if (best) addMatch("RA", [s], [best], round2(bestSim));
  }

  // Pass 1:M — one statement line settled by several customer lines (same ref).
  for (const s of S) {
    if (!avail(s)) continue;
    const group = C.filter((c) => avail(c) && c.normRef === s.normRef);
    if (group.length >= 2 && Math.abs(sum(group) - s.magnitude) < tol) addMatch("1:M", [s], group, 0.9);
  }
  // Pass M:1 — several statement lines settled by one customer line (same ref).
  for (const c of C) {
    if (!avail(c)) continue;
    const group = S.filter((s) => avail(s) && s.normRef === c.normRef);
    if (group.length >= 2 && Math.abs(sum(group) - c.magnitude) < tol) addMatch("M:1", group, [c], 0.9);
  }

  // Pass F — same reference but amount differs beyond tolerance → amount-difference exception.
  for (const s of S) {
    if (!avail(s)) continue;
    const c = C.find((x) => avail(x) && x.normRef === s.normRef);
    if (c) {
      used.add(s.key);
      used.add(c.key);
      pushException(exceptions, s, "F", round2(Math.abs(s.magnitude - c.magnitude)));
    }
  }

  // Stage 5 — classify everything still unmatched.
  for (const l of [...S, ...C]) {
    if (!avail(l)) continue;
    used.add(l.key);
    let cat: CategoryCode;
    if (!Number.isNaN(cutoff) && l.date && Date.parse(l.date) > cutoff) cat = "BAR";
    else cat = l.side === "statement" ? "D" : "E";
    pushException(exceptions, l, cat, l.magnitude);
  }

  const matchedLines = matches.reduce((n, m) => n + m.statementKeys.length + m.customerKeys.length, 0) + netted.size;
  const total = S.length + C.length;
  return {
    lines: all,
    matches,
    exceptions,
    nettedKeys: [...netted],
    summary: {
      statementCount: S.length,
      customerCount: C.length,
      matchedLines,
      exceptionCount: exceptions.length,
      autoMatchPct: total ? round2((matchedLines / total) * 100) : 0,
      matchedValue: round2(matches.reduce((s, m) => s + m.amount, 0)),
    },
  };
}

function pushException(list: ExceptionResult[], l: CanonLine, categoryCode: CategoryCode, amount: number) {
  list.push({
    key: l.key,
    side: l.side,
    categoryCode,
    severity: CATEGORY_SEVERITY[categoryCode],
    amount,
    reference: l.reference,
    description: l.description,
  });
}

function sum(lines: CanonLine[]): number {
  return round2(lines.reduce((s, l) => s + l.magnitude, 0));
}
