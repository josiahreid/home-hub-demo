import "server-only";
import { db, get } from "./db";

const IDENT = /^[a-z_]+$/;

export async function hasSampleData() {
  const row = await get<{ n: number }>("SELECT (SELECT count(*) FROM sample_rows) + (SELECT count(*) FROM sample_fills) AS n");
  return (row?.n ?? 0) > 0;
}

/** Deletes every row the sample-data script added and clears the fields it filled on real rows. */
export function removeSampleData() {
  const rows = db.prepare("SELECT tbl, row_id FROM sample_rows ORDER BY rowid DESC").all() as { tbl: string; row_id: number }[];
  const fills = db.prepare("SELECT tbl, row_id, col FROM sample_fills").all() as { tbl: string; row_id: number; col: string }[];
  db.exec("BEGIN");
  try {
    // newest first, so children go before the parents they point at
    for (const r of rows) if (IDENT.test(r.tbl)) db.prepare(`DELETE FROM ${r.tbl} WHERE id = ?`).run(r.row_id);
    for (const f of fills) if (IDENT.test(f.tbl) && IDENT.test(f.col)) db.prepare(`UPDATE ${f.tbl} SET ${f.col} = NULL WHERE id = ?`).run(f.row_id);
    db.exec("DELETE FROM sample_rows; DELETE FROM sample_fills;");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}
