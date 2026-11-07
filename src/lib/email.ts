/**
 * Best-effort reader for a saved email (.eml, as exported by Gmail "Download message",
 * Outlook "Save as" or Apple Mail). Pulls out From, Subject, Date and the plain-text body.
 */

export type ParsedEmail = { from: string | null; subject: string | null; date: string | null; body: string | null };

function decodeWords(s: string) {
  // RFC 2047 encoded words, e.g. =?UTF-8?B?...?= or =?utf-8?Q?...?=
  return s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      const bytes = enc.toUpperCase() === "B"
        ? Buffer.from(text, "base64")
        : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), "binary");
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return text;
    }
  });
}

function splitHeaders(raw: string) {
  const at = raw.search(/\r?\n\r?\n/);
  const head = at === -1 ? raw : raw.slice(0, at);
  const body = at === -1 ? "" : raw.slice(at).replace(/^\r?\n\r?\n/, "");
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return { headers, body };
}

function decodeBody(body: string, encoding: string | undefined, charset: string) {
  const enc = (encoding ?? "").toLowerCase();
  let bytes: Buffer;
  if (enc === "base64") bytes = Buffer.from(body.replace(/\s+/g, ""), "base64");
  else if (enc === "quoted-printable") {
    bytes = Buffer.from(body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), "binary");
  } else bytes = Buffer.from(body, "binary");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function textOf(headers: Map<string, string>, body: string, depth = 0): string | null {
  const type = headers.get("content-type") ?? "text/plain";
  const charset = /charset="?([^";]+)"?/i.exec(type)?.[1] ?? "utf-8";
  if (/^multipart\//i.test(type) && depth < 5) {
    const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
    if (!boundary) return null;
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith("--"));
    const parsed = parts.map((p) => splitHeaders(p.replace(/^\r?\n/, "")));
    // prefer plain text, fall back to HTML with tags stripped
    for (const want of [/^text\/plain/i, /^multipart\//i, /^text\/html/i]) {
      for (const part of parsed) {
        if (!want.test(part.headers.get("content-type") ?? "text/plain")) continue;
        const t = textOf(part.headers, part.body, depth + 1);
        if (t) return t;
      }
    }
    return null;
  }
  if (!/^text\//i.test(type)) return null;
  const text = decodeBody(body, headers.get("content-transfer-encoding"), charset);
  return /^text\/html/i.test(type)
    ? text.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    : text;
}

export function parseEml(raw: string): ParsedEmail {
  const { headers, body } = splitHeaders(raw);
  const date = headers.get("date");
  const parsedDate = date ? new Date(date) : null;
  const text = textOf(headers, body);
  return {
    from: headers.get("from") ? decodeWords(headers.get("from")!) : null,
    subject: headers.get("subject") ? decodeWords(headers.get("subject")!) : null,
    // local (NZ) calendar day, not the UTC one
    date: parsedDate && !isNaN(parsedDate.getTime())
      ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`
      : null,
    body: text ? text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000) : null,
  };
}
