export const CATEGORY_LABEL: Record<string, string> = {
  D: "Statement only",
  E: "Customer only",
  BAR: "Posted after cutoff",
  F: "Amount difference",
  FR: "Rounding",
};

export const RULE_LABEL: Record<string, string> = {
  R: "Exact",
  RA: "Fuzzy",
  RE: "Reversal",
  F: "Amount diff",
  "1:M": "One-to-many",
  "M:1": "Many-to-one",
};

export const SEVERITY_ORDER: Record<string, number> = { r: 0, c: 1, a: 2, n: 3, g: 4 };
