/**
 * Production bootstrap — creates exactly one Platform Admin from environment-supplied credentials.
 * This is the ONLY thing that should ever run against a production database on first setup.
 *
 * Never run `prisma/seed.ts` (npm run db:seed / prisma db seed) against production — it creates
 * demo companies, demo shipments, and every demo account with the same shared password.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL=owner@yourcompany.com BOOTSTRAP_ADMIN_PASSWORD='...' npx tsx prisma/bootstrap.ts
 *
 * Safe to re-run: if a Platform Admin already exists, it does nothing and exits cleanly instead of
 * creating a second one or overwriting the existing password.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { resolveDatabaseUrl } from "../src/lib/db-url";

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Admin";

  if (!email || !password) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set — refusing to bootstrap without them.");
  }
  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const existing = await prisma.user.findFirst({ where: { userType: "PLATFORM_ADMIN" } });
  if (existing) {
    console.log(`A Platform Admin already exists (${existing.email}) — nothing to do.`);
    return;
  }

  await prisma.platform.upsert({
    where: { id: "platform-1" },
    update: {},
    create: { id: "platform-1", name: "منصة الشحن البري" },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: { name, email, passwordHash, userType: "PLATFORM_ADMIN" },
  });

  console.log(`Platform Admin created: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
