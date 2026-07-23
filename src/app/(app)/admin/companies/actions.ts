"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";

export type FormState = { error?: string; ok?: string };

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createCompany(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user?.isSuperAdmin) return { error: "Only a super-admin can create companies." };

  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter a company name (at least 2 characters)." };

  const slug = slugify(name);
  if (!slug) return { error: "Company name must contain letters or numbers." };

  const [exists] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (exists) return { error: `A company with the slug "${slug}" already exists.` };

  await db.insert(tenants).values({ name, slug });
  revalidatePath("/admin/companies");
  revalidatePath("/admin/users");
  return { ok: `Created company "${name}".` };
}

export async function setCompanyActive(id: string, isActive: boolean): Promise<void> {
  const user = await currentUser();
  if (!user?.isSuperAdmin) return;
  await db.update(tenants).set({ isActive }).where(eq(tenants.id, id));
  revalidatePath("/admin/companies");
}
