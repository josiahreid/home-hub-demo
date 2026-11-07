import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Which commit this build is from, read straight from the .git folder (no git program needed –
 * the Docker image doesn't have one). Returns null when there's no .git folder.
 */
function commit(): string | null {
  const git = path.join(process.cwd(), ".git");
  try {
    const head = readFileSync(path.join(git, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head; // detached, e.g. a shallow clone
    const ref = head.replace(/^ref:\s*/, "");
    const loose = path.join(git, ref);
    if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
    const packed = readFileSync(path.join(git, "packed-refs"), "utf8");
    return packed.split("\n").find((l) => l.endsWith(` ${ref}`))?.split(" ")[0] ?? null;
  } catch {
    return null;
  }
}

/** Baked into the app when it's built, so Settings can show which update is running. */
export function buildInfo() {
  return {
    HOME_HUB_COMMIT: commit()?.slice(0, 7) ?? "",
    HOME_HUB_BUILT: new Date().toISOString(),
  };
}
