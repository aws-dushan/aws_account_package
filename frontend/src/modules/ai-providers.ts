/** AI providers the platform supports (admin picks one per purpose). */
export type AiProviderMeta = {
  value: "anthropic" | "openai" | "google" | "azure";
  label: string;
  modelPlaceholder: string;
  needsBaseUrl: boolean;
  /** Known model IDs for the provider's dropdown. Empty ⇒ free-text (e.g. Azure deployments). */
  models: string[];
};

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    value: "anthropic",
    label: "Anthropic Claude",
    modelPlaceholder: "claude-opus-4-8",
    needsBaseUrl: false,
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-fable-5"],
  },
  {
    value: "openai",
    label: "OpenAI",
    modelPlaceholder: "gpt-4o",
    needsBaseUrl: false,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3", "o4-mini"],
  },
  {
    value: "google",
    label: "Google Gemini / Vertex",
    modelPlaceholder: "gemini-1.5-pro",
    needsBaseUrl: false,
    models: ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  {
    value: "azure",
    label: "Azure OpenAI",
    modelPlaceholder: "<deployment-name>",
    needsBaseUrl: true,
    models: [], // Azure uses custom deployment names — free-text.
  },
];

export const AI_PURPOSES = [
  { key: "reasoning", label: "Reasoning", hint: "Exception explanations & match rescue (Phase 3)." },
  { key: "vision", label: "Vision (OCR)", hint: "Reading scanned PDFs / images (Phase 4)." },
] as const;

export function isValidProvider(v: string): v is AiProviderMeta["value"] {
  return AI_PROVIDERS.some((p) => p.value === v);
}
