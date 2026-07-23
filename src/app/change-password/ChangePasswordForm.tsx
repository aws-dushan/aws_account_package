"use client";

import { useFormState, useFormStatus } from "react-dom";
import { changePassword, type ChangeState } from "./actions";

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "var(--ground)",
};
const card: React.CSSProperties = {
  width: "min(400px, 94vw)",
  background: "var(--card)",
  border: "1px solid var(--hair)",
  borderRadius: 20,
  padding: "32px 30px",
  boxShadow: "var(--shadow)",
};
const input: React.CSSProperties = {
  width: "100%",
  height: 50,
  padding: "0 14px",
  marginBottom: 12,
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1.5px solid var(--hair)",
  borderRadius: 12,
  fontSize: 15,
  outline: "none",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        height: 50,
        marginTop: 6,
        border: "none",
        borderRadius: 12,
        background: "linear-gradient(100deg,#ee7623,#f2903f)",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.9 : 1,
      }}
    >
      {pending ? "Saving…" : "Set new password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, action] = useFormState<ChangeState, FormData>(changePassword, {});
  return (
    <main style={wrap}>
      <form style={card} action={action}>
        <h1 style={{ fontSize: 21, fontWeight: 750, margin: "0 0 4px" }}>Set a new password</h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "0 0 22px" }}>
          For security, choose a new password before continuing.
        </p>
        {state.error && (
          <div
            role="alert"
            style={{
              color: "#a62828",
              background: "#fbe0e0",
              border: "1px solid #f0b4b4",
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {state.error}
          </div>
        )}
        <input style={input} type="password" name="password" placeholder="New password" autoComplete="new-password" required minLength={8} />
        <input style={input} type="password" name="confirm" placeholder="Confirm new password" autoComplete="new-password" required minLength={8} />
        <SubmitButton />
      </form>
    </main>
  );
}
