import { apiGet } from "@/lib/api";
import { AI_PURPOSES } from "@/modules/ai-providers";
import AiSettingForm, { type AiConfig } from "./AiSettingForm";
import styles from "../../app.module.css";

type ApiSetting = {
  purpose: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  temperature: number | null;
  isActive: boolean;
  keyHint: string | null;
};

export default async function AiSettingsPage() {
  const rows = await apiGet<ApiSetting[]>("/api/ai-settings");
  const byPurpose = new Map(rows.map((r) => [r.purpose, r]));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>AI Settings</h1>
          <p>
            Configure the AI provider per purpose. Keys are encrypted at rest. The reasoning
            model powers exception explanations and match-rescue; the vision model reads
            scanned documents.
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
                keyHint: row.keyHint,
                baseUrl: row.baseUrl,
                temperature: row.temperature != null ? String(row.temperature) : null,
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
