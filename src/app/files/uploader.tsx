"use client";

import { useRef, useState } from "react";
import { FolderUp, ImagePlus, Upload } from "lucide-react";
import { btn, cx } from "@/components/ui";
import { uploadDocument, uploadsDone } from "./actions";

type Item = { file: File; rel: string };

/**
 * Upload photos, files or a whole folder at once into a category folder. Files go up one at a time with a progress
 * bar, so a big folder doesn't hit a size limit or time out; anything that can't be uploaded is listed afterwards.
 */
export function Uploader({ folders, folderId }: { folders: { id: number; name: string; icon: string }[]; folderId: number | null }) {
  const [target, setTarget] = useState(folderId ? String(folderId) : "");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const files = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  async function send(list: FileList | null) {
    if (!list?.length) return;
    // a folder's files carry their path inside it ("Tax 2025/Receipts/rates.pdf"); skip hidden system files
    const items: Item[] = [...list]
      .filter((f) => !f.name.startsWith(".") && f.name !== "Thumbs.db" && f.name !== "desktop.ini")
      .map((f) => ({ file: f, rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
    setFailed([]);
    setProgress({ done: 0, total: items.length });
    const bad: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const fd = new FormData();
      fd.set("file", items[i].file);
      fd.set("relative_path", items[i].rel);
      fd.set("folder_id", target);
      try {
        const r = await uploadDocument(fd);
        if (!r.ok) bad.push(`${items[i].file.name} – ${r.error}`);
      } catch {
        bad.push(`${items[i].file.name} – didn't upload (too big, or the connection dropped)`);
      }
      setProgress({ done: i + 1, total: items.length });
    }
    setFailed(bad);
    await uploadsDone();
    setProgress(null);
    for (const r of [files, photos, folder]) if (r.current) r.current.value = "";
  }

  const busy = progress != null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Into
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink">
            <option value="">Not in a folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={() => photos.current?.click()} className={btn.primary}><ImagePlus size={16} /> Photos</button>
        <button type="button" disabled={busy} onClick={() => files.current?.click()} className={btn.secondary}><Upload size={16} /> Files</button>
        <button type="button" disabled={busy} onClick={() => folder.current?.click()} className={btn.secondary}><FolderUp size={16} /> A whole folder</button>
      </div>
      <input ref={photos} type="file" accept="image/*" multiple hidden onChange={(e) => send(e.target.files)} />
      <input ref={files} type="file" multiple hidden onChange={(e) => send(e.target.files)} />
      {/* webkitdirectory: pick a folder and everything in it (computers; phones pick files instead) */}
      <input ref={folder} type="file" multiple hidden onChange={(e) => send(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
      {progress && (
        <div>
          <div className="mb-1 text-xs text-muted tabular-nums">Uploading {progress.done} of {progress.total}…</div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cx("h-full bg-accent transition-all")} style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        </div>
      )}
      {failed.length > 0 && (
        <div className="rounded-lg bg-warn-soft p-2 text-xs text-warn">
          <div className="font-medium">{failed.length} couldn&apos;t be uploaded:</div>
          <ul className="mt-1 list-disc pl-4">{failed.slice(0, 10).map((f) => <li key={f}>{f}</li>)}</ul>
          {failed.length > 10 && <div>…and {failed.length - 10} more</div>}
        </div>
      )}
      <p className="text-xs text-muted">Photos, PDFs, Word, Excel, CSV, emails, zip, video and audio – up to 15 MB each.</p>
    </div>
  );
}
