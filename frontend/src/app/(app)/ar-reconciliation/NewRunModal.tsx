"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../Modal";
import NewRunForm from "./new/NewRunForm";
import ProcessingOverlay from "./ProcessingOverlay";
import styles from "../app.module.css";

export default function NewRunModal({
  companies,
  isSuperAdmin,
}: {
  companies: { id: string; name: string }[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  return (
    <>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setOpen(true)}>
        + New reconciliation
      </button>

      <Modal
        open={open && !runId}
        onClose={() => setOpen(false)}
        title="New reconciliation"
        subtitle="Upload the two ledgers — mapping, matching and exceptions all run automatically."
      >
        <NewRunForm
          companies={companies}
          isSuperAdmin={isSuperAdmin}
          onCreated={(id) => {
            setOpen(false);
            setRunId(id);
          }}
        />
      </Modal>

      {runId && (
        <ProcessingOverlay
          runId={runId}
          onDone={() => {
            const id = runId;
            setRunId(null);
            router.push(`/ar-reconciliation/${id}`);
            router.refresh();
          }}
          onClose={() => setRunId(null)}
        />
      )}
    </>
  );
}
