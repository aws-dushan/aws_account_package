import { eq } from "drizzle-orm";
import { db } from "../db";
import { aiSettings } from "../db/schema";
import { decryptSecret } from "./crypto";

export class AiNotConfiguredError extends Error {
  constructor(purpose: string) {
    super(`AI is not configured for "${purpose}". Set it up in Admin → AI Settings.`);
    this.name = "AiNotConfiguredError";
  }
}

type ResolvedConfig = { provider: string; model: string; key: string; baseUrl: string | null; temperature: number };

async function loadConfig(purpose: "reasoning" | "vision"): Promise<ResolvedConfig> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.purpose, purpose)).limit(1);
  if (!row || !row.isActive || !row.apiKeyEnc) throw new AiNotConfiguredError(purpose);
  return {
    provider: row.provider,
    model: row.model,
    key: decryptSecret(row.apiKeyEnc),
    baseUrl: row.baseUrl,
    temperature: row.temperature != null ? Number(row.temperature) : 0.1,
  };
}

/** Provider-agnostic single-turn completion. Returns the model's text output. */
export async function aiComplete(params: {
  purpose?: "reasoning" | "vision";
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const cfg = await loadConfig(params.purpose ?? "reasoning");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, max_tokens: params.maxTokens ?? 1024, temperature: cfg.temperature, system: params.system, messages: [{ role: "user", content: params.user }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
      const j = await res.json();
      return j.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    }
    if (cfg.provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: params.system }] }, contents: [{ parts: [{ text: params.user }] }], generationConfig: { temperature: cfg.temperature } }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
      const j = await res.json();
      return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    }
    // openai / azure (OpenAI-compatible chat completions)
    const url =
      cfg.provider === "azure"
        ? `${(cfg.baseUrl || "").replace(/\/+$/, "")}/openai/deployments/${cfg.model}/chat/completions?api-version=2024-06-01`
        : "https://api.openai.com/v1/chat/completions";
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.provider === "azure") headers["api-key"] = cfg.key;
    else headers["authorization"] = `Bearer ${cfg.key}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature, messages: [{ role: "system", content: params.system }, { role: "user", content: params.user }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${cfg.provider} HTTP ${res.status}`);
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vision tier: extract a table from a PDF as a grid (first row = headers) using the
 * configured "vision" model. Anthropic + Google accept PDFs natively; OpenAI/Azure
 * would need pre-rendered images (not supported here → throws).
 */
export async function aiExtractPdfTable(buf: Buffer): Promise<string[][]> {
  const cfg = await loadConfig("vision");
  const b64 = buf.toString("base64");
  const prompt =
    "Extract the ledger table from this document. Return JSON ONLY as " +
    '{"rows":[["Header1","Header2",...],["cell","cell",...], ...]} — the first row is the ' +
    "column headers; preserve every data row and column. No commentary.";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    let text = "";
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 4096,
          messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: prompt }] }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
      const j = await res.json();
      text = j.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    } else if (cfg.provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "application/pdf", data: b64 } }, { text: prompt }] }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
      const j = await res.json();
      text = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    } else {
      throw new Error("PDF vision requires an Anthropic or Google provider for the vision purpose.");
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as { rows?: unknown[][] };
    return (parsed.rows ?? []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the model for JSON and parse it (tolerates ```json fences). */
export async function aiJson<T = unknown>(params: { purpose?: "reasoning" | "vision"; system: string; user: string; maxTokens?: number }): Promise<T> {
  const text = await aiComplete(params);
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}
