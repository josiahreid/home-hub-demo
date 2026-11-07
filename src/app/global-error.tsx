"use client";

/**
 * Last-resort screen when even the main layout fails – instead of a blank white page. It can't use the app's
 * styles (it replaces the whole page), so the look is inline.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <html lang="en-NZ">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f5f2", color: "#1d1c1a" }}>
        <title>Home Hub – something went wrong</title>
        <div style={{ maxWidth: 420, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>Home Hub hit a problem</h1>
          <p style={{ color: "#6b6862", fontSize: 14 }}>
            Try again in a minute. If it keeps happening, an update may have gone wrong – your data is safe and is backed up before every update.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#2f6f5e", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
          <p style={{ marginTop: 32, color: "#6b6862", fontSize: 12 }}>
            Version {process.env.HOME_HUB_COMMIT || "unknown"}
            {digest && <> · error code {digest}</>}
          </p>
        </div>
      </body>
    </html>
  );
}
