import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Liveness/readiness check for the hosting platform. Only checks what this process itself needs
 * to serve a request (the app is up, the database is reachable) — deliberately does NOT check
 * WhatsApp/Arshi: a provider outage is a normal, already-handled degraded state (see
 * notifications/service.ts), not a reason to have the host kill and restart a healthy app instance.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
