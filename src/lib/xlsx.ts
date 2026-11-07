import "server-only";
import { strToU8, zipSync } from "fflate";

/**
 * A small .xlsx writer: sheets of rows with money, date, number and text cells, a styled
 * header row, column widths, frozen header and an optional filter. Written by hand because
 * the usual Excel libraries pull in packages Next.js can't load from an exFAT drive.
 */

export type Cell = string | number | Date | null | undefined | { money: number | null } | { bold: string | number | null };
export type Column = { header: string; width?: number; type?: "money" | "date" | "text" };
export type Sheet = { name: string; columns: Column[]; rows: (Cell[] | { bold: true; cells: Cell[] })[]; filter?: boolean };

// style ids (see styles.xml below)
const S = { text: 0, header: 1, money: 2, date: 3, bold: 4, boldMoney: 5, number: 6 };

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // characters Excel refuses in XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i: number) => {
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Excel stores dates as days since 1899-12-30 (local date, no time zone). */
const excelDate = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;

function cell(ref: string, v: Cell, col: Column | undefined, bold: boolean) {
  if (v == null || v === "") return "";
  if (typeof v === "object" && !(v instanceof Date) && "money" in v) {
    return v.money == null ? "" : `<c r="${ref}" s="${bold ? S.boldMoney : S.money}"><v>${v.money}</v></c>`;
  }
  if (typeof v === "object" && !(v instanceof Date) && "bold" in v) return cell(ref, v.bold, col, true);
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : `<c r="${ref}" s="${S.date}"><v>${excelDate(v)}</v></c>`;
  if (typeof v === "number") {
    const style = col?.type === "money" ? (bold ? S.boldMoney : S.money) : bold ? S.bold : S.number;
    return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${bold ? S.bold : S.text}"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

function sheetXml(sh: Sheet) {
  const cols = sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`).join("");
  const head = `<row r="1">${sh.columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.header}"><is><t>${xml(c.header)}</t></is></c>`).join("")}</row>`;
  const body = sh.rows.map((row, r) => {
    const bold = !Array.isArray(row);
    const cells = Array.isArray(row) ? row : row.cells;
    // money columns: plain numbers in them are dollars already
    const out = cells.map((v, c) => {
      const col = sh.columns[c];
      const val = col?.type === "money" && typeof v === "number" ? { money: v } : v;
      return cell(`${colName(c)}${r + 2}`, val, col, bold);
    }).join("");
    return `<row r="${r + 2}">${out}</row>`;
  }).join("");
  const last = `${colName(sh.columns.length - 1)}${sh.rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${head}${body}</sheetData>${sh.filter && sh.rows.length ? `<autoFilter ref="A1:${last}"/>` : ""}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]-&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="d mmm yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F6F5E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs></styleSheet>`;

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  // sheet names: max 31 chars, no []:*?/\ and unique
  const names = sheets.map((s, i) => s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || `Sheet${i + 1}`);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}
</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}
