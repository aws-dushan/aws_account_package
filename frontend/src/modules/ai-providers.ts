/** AI providers the platform supports (admin picks one per purpose). */
export type AiProviderMeta = {
  value: "anthropic" | "openai" | "google" | "azure";
  label: string;
  modelPlaceholder: string;
  needsBaseUrl: boolean;
};

export const AI_PROVIDERS: AiProviderMeta[] = [
  { value: "anthropic", label: "Anthropic Claude", modelPlaceholder: "claude-opus-4-8", needsBaseUrl: false },
  { value: "openai", label: "OpenAI", modelPlaceholder: "gpt-4o", needsBaseUrl: false },
  { value: "google", label: "Google Gemini / Vertex", modelPlaceholder: "gemini-1.5-pro", needsBaseUrl: false },
  { value: "azure", label: "Azure OpenAI", modelPlaceholder: "<deployment-name>", needsBaseUrl: true },
];

export const AI_PURPOSES = [
  { key: "reasoning", label: "Reasoning", hint: "Exception explanations & match rescue (Phase 3)." },
  { key: "vision", label: "Vision (OCR)", hint: "Reading scanned PDFs / images (Phase 4)." },
] as const;

export function isValidProvider(v: string): v is AiProviderMeta["value"] {
  return AI_PROVIDERS.some((p) => p.value === v);
}
