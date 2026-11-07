import { readFileSync } from "node:fs";
import path from "node:path";
import { BACKUP_DIR } from "@/lib/db";
import { fullBackupZip, isBackupName } from "@/lib/backup";

/**
 * GET /settings/backups/download            → a full backup (.zip: database + uploads), made now
 * GET /settings/backups/download?file=…     → one saved database backup
 * Only reachable the way the rest of Home Hub is (this PC, or your Tailscale devices).
 */
export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file");
  if (file) {
    if (!isBackupName(file)) return new Response("No such backup.", { status: 404 });
    try {
      const bytes = readFileSync(path.join(BACKUP_DIR, file));
      return new Response(bytes, {
        headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" },
      });
    } catch {
      return new Response("No such backup.", { status: 404 });
    }
  }
  const { name, bytes } = fullBackupZip();
  return new Response(bytes as BodyInit, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
