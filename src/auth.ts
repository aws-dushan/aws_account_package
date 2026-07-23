import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./db";
import { tenants, users } from "./db/schema";
import { verifyPassword } from "./lib/password";

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const [row] = await db
          .select({
            id: users.id,
            passwordHash: users.passwordHash,
            displayName: users.displayName,
            username: users.username,
            isAdmin: users.isAdmin,
            isActive: users.isActive,
            mustChangePassword: users.mustChangePassword,
            tenantId: users.tenantId,
            tenantSlug: tenants.slug,
            tenantActive: tenants.isActive,
          })
          .from(users)
          .leftJoin(tenants, eq(users.tenantId, tenants.id))
          .where(eq(users.username, username))
          .limit(1);

        if (!row || !row.isActive) return null;
        if (row.tenantId && !row.tenantActive) return null; // company disabled
        if (!(await verifyPassword(row.passwordHash, password))) return null;

        return {
          id: row.id,
          name: row.displayName,
          username: row.username,
          isAdmin: row.isAdmin,
          mustChangePassword: row.mustChangePassword,
          tenantId: row.tenantId ?? null,
          tenantSlug: row.tenantSlug ?? null,
        };
      },
    }),
  ],
});
