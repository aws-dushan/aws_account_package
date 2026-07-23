import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { currentUser } from "@/lib/session";

export type AuditInput = {
  action: string;
  entity?: string;
  entityId?: string;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
  /** Provide when the actor isn't derivable from the session (e.g. login events). */
  actor?: { id: string; username: string };
};

/** Append one audit record. Never throws into the caller (best-effort). */
export async function writeAudit(entry: AuditInput): Promise<void> {
  try {
    let actor = entry.actor;
    if (!actor) {
      const u = await currentUser();
      if (u) actor = { id: u.id, username: u.username };
    }
    await db.insert(auditLog).values({
      actorUserId: actor?.id ?? null,
      actorUsername: actor?.username ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      tenantId: entry.tenantId ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.error("audit write failed:", e);
  }
}
