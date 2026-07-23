import { redirect } from "next/navigation";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { keyHint } from "@/lib/crypto";
import { AI_PURPOSES } from "@/modules/ai-providers";
import AiSettingForm, { type AiConfig } from "./AiSettingForm";
import styles from "../../app.module.css";

export default async function AiSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.isSuperAdmin) redirect("/dashboard");

  const rows = await db.select().from(aiSettings);
  const byPurpose = new Map(rows.map((r) => [r.purpose, r]));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>AI Settings</h1>
          <p>
            Configure the AI provider per purpose. Keys are encrypted at rest. The reasoning
            model powers exception explanations (Phase 3); the vision model reads scanned
            documents (Phase 4).
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {AI_PURPOSES.map((p) => {
          const row = byPurpose.get(p.key);
          const config: AiConfig | null = row
            ? {
                provider: row.provider,
                model: row.model,
                keyHint: keyHint(row.apiKeyEnc),
                baseUrl: row.baseUrl,
                temperature: row.temperature,
                isActive: row.isActive,
              }
            : null;
          return (
            <AiSettingForm key={p.key} purpose={p.key} label={p.label} hint={p.hint} config={config} />
          );
        })}
      </div>
    </>
  );
}
