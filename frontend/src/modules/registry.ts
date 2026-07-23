/**
 * Module registry — the single source of truth for which modules exist and what
 * capabilities (features) each exposes. The admin permission editor renders this,
 * and `can()` checks keys against it. New modules register here; their features
 * then appear in the permission tree automatically.
 *
 * Permission key format: `${module.key}.${feature.key}` (e.g. "ar-reconciliation.run.create").
 */
export type ModuleFeature = { key: string; label: string };
export type PlatformModule = {
  key: string;
  name: string;
  href: string;
  features: ModuleFeature[];
};

export const MODULES: PlatformModule[] = [
  {
    key: "ar-reconciliation",
    name: "AR Reconciliation",
    href: "/ar-reconciliation",
    features: [
      { key: "view", label: "View runs & results" },
      { key: "run.create", label: "Create & run a reconciliation" },
      { key: "report.export", label: "Download reports & documents" },
    ],
  },
];

/** Flat list of every valid permission key. */
export const ALL_PERMISSION_KEYS: string[] = MODULES.flatMap((m) =>
  m.features.map((f) => `${m.key}.${f.key}`),
);

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}
