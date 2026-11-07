import { get } from "@/lib/db";

// GET /api/health – used by the Docker healthcheck. Also proves the database opens.
export async function GET() {
  const row = await get<{ user_version: number }>("PRAGMA user_version");
  return Response.json({ ok: true, db: row?.user_version ?? null });
}
