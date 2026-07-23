import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

const ADMIN_USERNAME = "Dev_Admin";
const ADMIN_PASSWORD = "Admin@12345";

// A first company to select when creating users.
const COMPANY = { name: "AWS Distribution", slug: "aws-distribution" };

async function main() {
  // 1) Seed an initial company (tenant).
  let [company] = await db.select().from(tenants).where(eq(tenants.slug, COMPANY.slug)).limit(1);
  if (!company) {
    [company] = await db.insert(tenants).values(COMPANY).returning();
    console.log(`Seeded company: ${company.name} (${company.slug})`);
  } else {
    console.log(`Company "${company.slug}" already exists.`);
  }

  // 2) Seed the platform super-admin (tenantId = null → spans all companies).
  const [existing] = await db.select().from(users).where(eq(users.username, ADMIN_USERNAME)).limit(1);
  if (existing) {
    console.log(`User "${ADMIN_USERNAME}" already exists — leaving it unchanged.`);
  } else {
    await db.insert(users).values({
      tenantId: null, // platform super-admin
      username: ADMIN_USERNAME,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      displayName: "Dev Admin",
      isAdmin: true, // super-user: full access, can manage all companies & users
      isActive: true,
      mustChangePassword: false, // developer account
    });
    console.log("Seeded platform super-admin:");
    console.log(`  username: ${ADMIN_USERNAME}`);
    console.log(`  password: ${ADMIN_PASSWORD}`);
    console.log("  scope: super-admin (all companies, full permissions)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
