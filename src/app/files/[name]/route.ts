import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf",
  ".eml": "message/rfc822", ".msg": "application/vnd.ms-outlook", ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8", ".odt": "application/vnd.oasis.opendocument.text", ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".rtf": "application/rtf", ".zip": "application/zip", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};
// shown in the browser; anything else is downloaded (with ?name= as its file name)
const INLINE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".pdf", ".txt", ".mp4", ".mov", ".m4a", ".mp3", ".wav"]);

// Serves receipts, quotes and bills saved under data/uploads.
export async function GET(req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  try {
    const data = await readFile(path.join(UPLOAD_DIR, safe));
    return new Response(data, {
      headers: {
        "Content-Type": TYPES[path.extname(safe).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${INLINE.has(path.extname(safe).toLowerCase()) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(new URL(req.url).searchParams.get("name") || safe)}`,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
