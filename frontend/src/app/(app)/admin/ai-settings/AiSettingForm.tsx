"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveAiSetting, testConnection, type FormState } from "./actions";
import { AI_PROVIDERS } from "@/modules/ai-providers";
import styles from "../../app.module.css";

export type AiConfig = {
  provider: string;
  model: string;
  keyHint: string | null;
  baseUrl: string | null;
  temperature: string | null;
  isActive: boolean;
};

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export default function AiSettingForm({
  purpose,
  label,
  hint,
  config,
}: {
  purpose: string;
  label: string;
  hint: string;
  config: AiConfig | null;
}) {
  const [state, action] = useFormState<FormState, FormData>(saveAiSetting, {});
  const [provider, setProvider] = useState(config?.provider ?? "anthropic");
  const [model, setModel] = useState(config?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [temperature, setTemperature] = useState(config?.temperature ?? "");
  const [isActive, setIsActive] = useState(config?.isActive ?? false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const meta = AI_PROVIDERS.find((p) => p.value === provider);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    const r = await testConnection({ purpose, provider, model, apiKey, baseUrl });
    setTestResult(r);
    setTesting(false);
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {label}
        <span className={`${styles.badge} ${isActive ? styles.badgeOk : styles.badgeOff}`}>
          {isActive ? "Active" : "Off"}
        </span>
      </div>
      <div className={styles.cardPad}>
        <p className={styles.help} style={{ marginTop: 0, marginBottom: 16 }}>{hint}</p>
        <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
          <input type="hidden" name="purpose" value={purpose} />

          {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
          {state.ok && <div className={`${styles.alert} ${styles.alertOk}`}>{state.ok}</div>}

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Provider</label>
              <select
                name="provider"
                className={styles.select}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Model</label>
              <input
                name="model"
                className={styles.input}
                placeholder={meta?.modelPlaceholder}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>API key</label>
            <input
              name="apiKey"
              type="password"
              className={styles.input}
              placeholder={config?.keyHint ? `${config.keyHint} (leave blank to keep)` : "Paste API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <span className={styles.help}>Stored encrypted (AES-256-GCM). Never shown again.</span>
          </div>

          {meta?.needsBaseUrl && (
            <div className={styles.field}>
              <label className={styles.label}>Endpoint (base URL)</label>
              <input
                name="baseUrl"
                className={styles.input}
                placeholder="https://<resource>.openai.azure.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.field} style={{ maxWidth: 160 }}>
              <label className={styles.label}>Temperature</label>
              <input
                name="temperature"
                className={styles.input}
                placeholder="e.g. 0.20"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: 9, alignSelf: "flex-end", paddingBottom: 12 }}>
              <input type="checkbox" name="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--brand)" }} />
              <span className={styles.label} style={{ margin: 0 }}>Active</span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <SaveBtn />
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={runTest} disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && (
              <span className={`${styles.badge} ${testResult.ok ? styles.badgeOk : styles.badgeOff}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
