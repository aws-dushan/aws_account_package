"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { isValidProvider } from "@/modules/ai-providers";

export type FormState = { error?: string; ok?: string };

export async function saveAiSetting(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return { error: "Only a super-admin can configure AI." };

  const purpose = String(fd.get("purpose") ?? "");
  const provider = String(fd.get("provider") ?? "");
  const model = String(fd.get("model") ?? "").trim();
  const apiKey = String(fd.get("apiKey") ?? "").trim();
  const baseUrl = String(fd.get("baseUrl") ?? "").trim() || null;
  const isActive = fd.get("isActive") === "on";
  const tempRaw = String(fd.get("temperature") ?? "").trim();

  if (!["reasoning", "vision"].includes(purpose)) return { error: "Invalid purpose." };
  if (!isValidProvider(provider)) return { error: "Select a provider." };
  if (!model) return { error: "Enter a model name." };
  if (provider === "azure" && !baseUrl) return { error: "Azure requires an endpoint (base URL)." };

  const temperature = tempRaw === "" ? null : String(Number(tempRaw));
  const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.purpose, purpose)).limit(1);

  const base = { provider, model, baseUrl, temperature, isActive, updatedAt: new Date() };
  if (existing) {
    await db
      .update(aiSettings)
      .set(apiKey ? { ...base, apiKeyEnc: encryptSecret(apiKey) } : base)
      .where(eq(aiSettings.purpose, purpose));
  } else {
    await db.insert(aiSettings).values({
      purpose,
      ...base,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
    });
  }

  await writeAudit({
    action: "ai.settings.save",
    entity: "ai_settings",
    entityId: purpose,
    metadata: { provider, model, keyUpdated: !!apiKey, isActive },
  });
  revalidatePath("/admin/ai-settings");
  return { ok: `Saved ${purpose} configuration.` };
}

type TestInput = { purpose: string; provider: string; model: string; apiKey?: string; baseUrl?: string };

export async function testConnection(input: TestInput): Promise<{ ok: boolean; message: string }> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return { ok: false, message: "Not allowed." };

  // Use the freshly-entered key, else the stored one.
  let key = input.apiKey?.trim() || "";
  if (!key) {
    const [row] = await db.select().from(aiSettings).where(eq(aiSettings.purpose, input.purpose)).limit(1);
    if (row?.apiKeyEnc) {
      try {
        key = decryptSecret(row.apiKeyEnc);
      } catch {
        return { ok: false, message: "Stored key could not be decrypted." };
      }
    }
  }
  if (!key) return { ok: false, message: "Enter an API key to test." };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    let res: Response;
    switch (input.provider) {
      case "openai":
        res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: ctrl.signal,
        });
        break;
      case "anthropic":
        res = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: ctrl.signal,
        });
        break;
      case "google":
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          { signal: ctrl.signal },
        );
        break;
      case "azure": {
        const base = (input.baseUrl || "").replace(/\/+$/, "");
        if (!base) return { ok: false, message: "Azure endpoint (base URL) is required." };
        res = await fetch(`${base}/openai/models?api-version=2024-06-01`, {
          headers: { "api-key": key },
          signal: ctrl.signal,
        });
        break;
      }
      default:
        return { ok: false, message: "Unknown provider." };
    }

    if (res.ok) return { ok: true, message: "Connection successful — key is valid." };
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: "Authentication failed — check the API key." };
    return { ok: false, message: `Provider returned HTTP ${res.status}.` };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Request timed out." : "Network error reaching provider.";
    return { ok: false, message: msg };
  } finally {
    clearTimeout(timer);
  }
}
