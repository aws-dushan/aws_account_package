"use server";

import { revalidatePath } from "next/cache";
import { apiPut, apiPost, ApiError } from "@/lib/api";
import { isValidProvider } from "@/modules/ai-providers";

export type FormState = { error?: string; ok?: string };

export async function saveAiSetting(_prev: FormState, fd: FormData): Promise<FormState> {
  const purpose = String(fd.get("purpose") ?? "");
  const provider = String(fd.get("provider") ?? "");
  const model = String(fd.get("model") ?? "").trim();
  const apiKey = String(fd.get("apiKey") ?? "").trim();
  const baseUrl = String(fd.get("baseUrl") ?? "").trim() || null;
  const isActive = fd.get("isActive") === "on";
  const tempRaw = String(fd.get("temperature") ?? "").trim();

  if (!["reasoning", "vision"].includes(purpose)) return { error: "Invalid purpose." };
  if (!isValidProvider(provider)) return { error: "Select a provider." };
  if (!model) return { error: "Select a model." };
  if (provider === "azure" && !baseUrl) return { error: "Azure requires an endpoint (base URL)." };

  const temperature = tempRaw === "" ? null : Number(tempRaw);
  if (temperature != null && Number.isNaN(temperature)) return { error: "Temperature must be a number." };

  try {
    await apiPut("/api/ai-settings", {
      purpose,
      provider,
      model,
      apiKey: apiKey || null,
      baseUrl,
      temperature,
      isActive,
    });
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not save the configuration." };
  }

  revalidatePath("/admin/ai-settings");
  return { ok: `Saved ${purpose} configuration.` };
}

type TestInput = { purpose: string; provider: string; model: string; apiKey?: string; baseUrl?: string };

export async function testConnection(input: TestInput): Promise<{ ok: boolean; message: string }> {
  try {
    return await apiPost<{ ok: boolean; message: string }>("/api/ai-settings/test", {
      purpose: input.purpose,
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey || null,
      baseUrl: input.baseUrl || null,
    });
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : "Could not reach the API." };
  }
}
