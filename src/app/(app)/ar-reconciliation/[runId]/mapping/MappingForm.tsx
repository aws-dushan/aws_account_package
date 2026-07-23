"use client";

import { useState } from "react";
import { confirmMapping } from "../../actions";
import { mappingGaps, type ColumnMapping, type CanonicalField } from "@/modules/ar-reconciliation/ledger-mapping";
import styles from "../../../app.module.css";

export type LedgerPreview = {
  name: string;
  headers: string[];
  sample: string[][];
  mapping: ColumnMapping;
};

function ColSelect({
  value,
  headers,
  onChange,
}: {
  value: number;
  headers: string[];
  onChange: (v: number) => void;
}) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ height: 40 }}>
      <option value={-1}>— none —</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
      ))}
    </select>
  );
}

function LedgerMap({
  title,
  preview,
  mapping,
  setMapping,
}: {
  title: string;
  preview: LedgerPreview;
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
}) {
  const setCol = (field: CanonicalField, v: number) =>
    setMapping({ ...mapping, columns: { ...mapping.columns, [field]: v } });
  const gaps = mappingGaps(mapping);

  const Field = ({ label, field }: { label: string; field: CanonicalField }) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <ColSelect value={mapping.columns[field]} headers={preview.headers} onChange={(v) => setCol(field, v)} />
    </div>
  );

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {title}
        <span className={styles.help}>{preview.name}</span>
      </div>
      <div className={styles.cardPad} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className={styles.formRow}>
          <Field label="Reference" field="reference" />
          <Field label="Date" field="date" />
          <Field label="Description" field="description" />
        </div>

        <div className={styles.field} style={{ maxWidth: 320 }}>
          <label className={styles.label}>Amounts are in…</label>
          <select
            className={styles.select}
            value={mapping.amountMode}
            onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value as ColumnMapping["amountMode"] })}
            style={{ height: 40 }}
          >
            <option value="debit_credit">Separate Debit &amp; Credit columns</option>
            <option value="signed">One signed Amount column</option>
          </select>
        </div>

        {mapping.amountMode === "debit_credit" ? (
          <div className={styles.formRow}>
            <Field label="Debit" field="debit" />
            <Field label="Credit" field="credit" />
          </div>
        ) : (
          <div className={styles.formRow}>
            <Field label="Amount" field="amount" />
            <div className={styles.field}>
              <label className={styles.label}>Positive amount means</label>
              <select
                className={styles.select}
                value={mapping.positiveIsDebit ? "debit" : "credit"}
                onChange={(e) => setMapping({ ...mapping, positiveIsDebit: e.target.value === "debit" })}
                style={{ height: 40 }}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
        )}

        {gaps.length > 0 && (
          <div className={`${styles.alert} ${styles.alertErr}`}>
            Please map: {gaps.join(", ")}.
          </div>
        )}

        <div>
          <div className={styles.label} style={{ marginBottom: 6 }}>Preview (first rows)</div>
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 480 }}>
              <thead>
                <tr>{preview.headers.map((h, i) => <th key={i}>{h || `Col ${i + 1}`}</th>)}</tr>
              </thead>
              <tbody>
                {preview.sample.map((row, r) => (
                  <tr key={r}>
                    {preview.headers.map((_, i) => (
                      <td key={i} className={styles.mono} style={{ fontSize: 12 }}>{row[i] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MappingForm({
  runId,
  statement,
  customer,
}: {
  runId: string;
  statement: LedgerPreview;
  customer: LedgerPreview;
}) {
  const [sMap, setSMap] = useState<ColumnMapping>(statement.mapping);
  const [cMap, setCMap] = useState<ColumnMapping>(customer.mapping);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const gaps = [...mappingGaps(sMap), ...mappingGaps(cMap)];

  async function run() {
    setBusy(true);
    setErr("");
    const res = await confirmMapping({ runId, statement: sMap, customer: cMap });
    if (res?.error) {
      setErr(res.error);
      setBusy(false);
    }
    // on success the action redirects to the results page
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LedgerMap title="Statement of Account" preview={statement} mapping={sMap} setMapping={setSMap} />
      <LedgerMap title="Customer Ledger" preview={customer} mapping={cMap} setMapping={setCMap} />

      {err && <div className={`${styles.alert} ${styles.alertErr}`}>{err}</div>}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={run} disabled={busy || gaps.length > 0}>
          {busy ? "Reconciling…" : "Run reconciliation"}
        </button>
        {gaps.length > 0 && <span className={styles.help}>Map all required columns to continue.</span>}
      </div>
    </div>
  );
}
