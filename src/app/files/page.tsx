import Link from "next/link";
import { io } from "next/cache";
import { File, FileImage, FileSpreadsheet, FileText, FileVideo, Music, Search } from "lucide-react";
import { all } from "@/lib/db";
import { fileUrl } from "@/lib/uploads";
import { niceDate } from "@/lib/format";
import { bytes } from "@/lib/storage";
import { AddPanel, Card, Empty, Input, PageHeader, Select, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addFolder, deleteDocument, deleteFolder, renameFolder, updateDocument } from "./actions";
import { Uploader } from "./uploader";

type Folder = { id: number; name: string; icon: string; n: number };
type Doc = { id: number; folder_id: number | null; name: string; subfolder: string | null; file_name: string; size: number | null; notes: string | null; uploaded_at: string };
/** A file uploaded somewhere else in Home Hub (a receipt, a quote, a bill…) – shown here, kept where it belongs. */
type AppFile = { file_name: string; title: string; date: string | null; href: string };

// files uploaded around Home Hub, each group with where it lives
const APP_GROUPS: { key: string; name: string; icon: string; sql: string }[] = [
  { key: "receipts", name: "Receipts", icon: "🧾", sql: "SELECT file_name, coalesce(store, 'Receipt') AS title, coalesce(date, substr(uploaded_at, 1, 10)) AS date, '/budget/receipts' AS href FROM receipts WHERE file_name IS NOT NULL" },
  { key: "bills", name: "Utility bills", icon: "🔌", sql: "SELECT b.file_name, u.kind || ' – ' || u.provider AS title, b.period_end AS date, '/utilities/' || u.id AS href FROM utility_bills b JOIN utilities u ON u.id = b.utility_id WHERE b.file_name IS NOT NULL" },
  { key: "insurance", name: "Insurance documents", icon: "🛡️", sql: "SELECT d.file_name, coalesce(d.title, d.kind) AS title, d.added_on AS date, '/insurance/' || d.policy_id AS href FROM insurance_docs d WHERE d.file_name IS NOT NULL" },
  { key: "projects", name: "Project invoices & receipts", icon: "🔨", sql: "SELECT d.file_name, coalesce(d.supplier, d.kind, 'Document') AS title, coalesce(d.date, substr(d.uploaded_at, 1, 10)) AS date, '/house/projects/' || d.project_id AS href FROM project_documents d WHERE d.file_name IS NOT NULL" },
  { key: "quotes", name: "Quotes", icon: "📋", sql: "SELECT file_name, supplier AS title, date, '/house/quotes' AS href FROM quotes WHERE file_name IS NOT NULL" },
  { key: "emails", name: "Project emails", icon: "✉️", sql: "SELECT file_name, coalesce(subject, from_addr, 'Email') AS title, date, '/house/projects/' || project_id AS href FROM project_emails WHERE file_name IS NOT NULL" },
];

const ext = (f: string) => f.slice(f.lastIndexOf(".")).toLowerCase();
const isImage = (f: string) => [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext(f));
function FileIcon({ name }: { name: string }) {
  const e = ext(name);
  const Icon = isImage(name) || [".heic", ".heif"].includes(e) ? FileImage : e === ".pdf" || e === ".txt" || e === ".doc" || e === ".docx" || e === ".rtf" || e === ".odt" ? FileText
    : [".xls", ".xlsx", ".csv", ".ods"].includes(e) ? FileSpreadsheet : [".mp4", ".mov"].includes(e) ? FileVideo : [".mp3", ".m4a", ".wav"].includes(e) ? Music : File;
  return <Icon size={28} strokeWidth={1.5} className="text-muted" />;
}
/** The link to open (or download) a file, with its proper name. */
const openUrl = (stored: string, name: string) => `${fileUrl(stored)}?name=${encodeURIComponent(name)}`;

/** Files: important documents in category folders, plus everything uploaded around Home Hub, in one place. */
export default async function Files({ searchParams }: PageProps<"/files">) {
  await io();
  const sp = await searchParams;
  const sel = typeof sp.f === "string" ? sp.f : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const folders = await all<Folder>(
    "SELECT f.id, f.name, f.icon, (SELECT count(*) FROM documents d WHERE d.folder_id = f.id) AS n FROM doc_folders f ORDER BY f.sort, f.name");
  const docs = await all<Doc>("SELECT * FROM documents ORDER BY uploaded_at DESC, id DESC");
  const unfiled = docs.filter((d) => !d.folder_id).length;
  const appFiles = await Promise.all(APP_GROUPS.map(async (g) => ({ ...g, files: await all<AppFile>(`${g.sql} ORDER BY date DESC`) })));
  const totalSize = docs.reduce((s, d) => s + (d.size ?? 0), 0);

  const folderNum = Number(sel);
  const folder = folders.find((f) => f.id === folderNum);
  const group = sel.startsWith("app-") ? appFiles.find((g) => `app-${g.key}` === sel) : undefined;
  const match = (s: string | null) => !q || (s ?? "").toLowerCase().includes(q.toLowerCase());
  const shown = group ? [] : docs.filter((d) => (sel === "all" ? true : sel === "none" ? !d.folder_id : d.folder_id === folderNum) && (match(d.name) || match(d.notes) || match(d.subfolder)));
  const shownApp = group ? group.files.filter((f) => match(f.title)) : sel === "all" && q ? appFiles.flatMap((g) => g.files.filter((f) => match(f.title))) : [];
  const title = group ? `${group.icon} ${group.name}` : folder ? `${folder.icon} ${folder.name}` : sel === "none" ? "Not in a folder" : q ? `Search: "${q}"` : "All your files";
  const href = (f: string) => `/files?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const folderOptions: [string, string][] = [["", "Not in a folder"], ...folders.map((f): [string, string] => [String(f.id), `${f.icon} ${f.name}`])];

  return (
    <>
      <PageHeader title="Files" subtitle={`Important documents, photos, invoices and PDFs – ${docs.length} of yours (${bytes(totalSize)}) plus ${appFiles.reduce((s, g) => s + g.files.length, 0)} from around Home Hub.`} />
      <div className="grid gap-4 lg:grid-cols-4">
        {/* phones: the files first, then upload and folders */}
        <div className="order-2 space-y-4 lg:order-1">
          <Card title="Upload">
            <Uploader folders={folders} folderId={folder?.id ?? null} />
          </Card>
          <Card title="Folders">
            <nav className="space-y-0.5 text-sm">
              {[{ key: "all", label: "📂 All your files", n: docs.length }, ...folders.map((f) => ({ key: String(f.id), label: `${f.icon} ${f.name}`, n: f.n })), { key: "none", label: "🗂️ Not in a folder", n: unfiled }].map((f) => (
                <Link key={f.key} href={href(f.key)} className={cx("flex items-center justify-between rounded-lg px-2 py-1.5", sel === f.key ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}>
                  <span className="min-w-0 truncate">{f.label}</span><span className="text-xs text-muted tabular-nums">{f.n}</span>
                </Link>
              ))}
              <div className="mt-3 mb-1 px-2 text-xs font-semibold tracking-wide text-muted uppercase">From around Home Hub</div>
              {appFiles.map((g) => (
                <Link key={g.key} href={href(`app-${g.key}`)} className={cx("flex items-center justify-between rounded-lg px-2 py-1.5", sel === `app-${g.key}` ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}>
                  <span className="min-w-0 truncate">{g.icon} {g.name}</span><span className="text-xs text-muted tabular-nums">{g.files.length}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <AddPanel label="New folder">
                <form action={addFolder} className="flex gap-2">
                  <Input name="icon" placeholder="📁" maxLength={8} className="!w-14 text-center" aria-label="Emoji" />
                  <Input name="name" required placeholder="e.g. Tax 2026" className="min-w-0 flex-1" aria-label="Folder name" />
                  <SubmitButton>Add</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>
        </div>

        <div className="order-1 space-y-4 lg:order-2 lg:col-span-3">
          <form className="flex gap-2" action="/files">
            <input type="hidden" name="f" value={sel} />
            <Input name="q" defaultValue={q} placeholder="Search file names and notes" aria-label="Search" />
            <button className={btn.secondary}><Search size={15} /> Search</button>
            {q && <Link href={`/files?f=${sel}`} className={btn.ghost}>Clear</Link>}
          </form>

          <Card title={title} actions={folder && <FolderEdit folder={folder} />}>
            {group ? (
              shownApp.length === 0 ? <Empty>Nothing here yet.</Empty> : <AppGrid files={shownApp} />
            ) : (
              <>
                {shown.length === 0 && shownApp.length === 0 ? (
                  <Empty>{q ? "Nothing matches." : "No files here yet – upload some on the left."}</Empty>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {shown.map((d) => (
                      <li key={d.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                        <a href={openUrl(d.file_name, d.name)} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-surface-2">
                          {isImage(d.file_name) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl(d.file_name)!} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
                          ) : <FileIcon name={d.file_name} />}
                        </a>
                        <div className="p-2">
                          <div className="truncate text-sm font-medium" title={d.name}>{d.name}</div>
                          <div className="truncate text-xs text-muted">
                            {sel === "all" && <>{folders.find((f) => f.id === d.folder_id)?.icon ?? "🗂️"} </>}
                            {d.subfolder ? `${d.subfolder} · ` : ""}{bytes(d.size ?? 0)} · {niceDate(d.uploaded_at.slice(0, 10))}
                          </div>
                          {d.notes && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{d.notes}</div>}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-accent select-none">Edit</summary>
                            <form action={updateDocument} className="mt-1 space-y-1.5">
                              <input type="hidden" name="id" value={d.id} />
                              <Input name="name" defaultValue={d.name} required className="!py-1 text-xs" aria-label="Name" />
                              <Select name="folder_id" defaultValue={d.folder_id ? String(d.folder_id) : ""} options={folderOptions} className="!py-1 text-xs" aria-label="Folder" />
                              <Input name="notes" defaultValue={d.notes ?? ""} placeholder="Notes" className="!py-1 text-xs" aria-label="Notes" />
                              <SubmitButton variant="secondary" className="!py-1 text-xs">Save</SubmitButton>
                            </form>
                            <div className="mt-1"><DeleteButton action={deleteDocument} id={d.id} label="Delete" confirmText={`Delete "${d.name}"? The file is removed for good.`} /></div>
                          </details>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {shownApp.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-semibold text-muted">From around Home Hub</h3>
                    <AppGrid files={shownApp} />
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Files that belong to a receipt, bill, policy or project – open them, or go to where they're kept. */
function AppGrid({ files }: { files: AppFile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {files.map((f) => (
        <li key={f.file_name} className="overflow-hidden rounded-xl border border-line bg-surface">
          <a href={openUrl(f.file_name, `${f.title}${ext(f.file_name)}`)} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-surface-2">
            {isImage(f.file_name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(f.file_name)!} alt={f.title} loading="lazy" className="h-full w-full object-cover" />
            ) : <FileIcon name={f.file_name} />}
          </a>
          <div className="p-2">
            <div className="truncate text-sm font-medium" title={f.title}>{f.title}</div>
            <div className="flex justify-between gap-2 text-xs text-muted">
              <span>{f.date ? niceDate(f.date.slice(0, 10)) : ""}</span>
              <Link href={f.href} className="text-accent">Open its page</Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rename or delete a folder (its files move to "Not in a folder"). */
function FolderEdit({ folder }: { folder: Folder }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none text-xs text-accent [&::-webkit-details-marker]:hidden">Rename or delete</summary>
      <div className="absolute right-0 z-10 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border border-line bg-surface p-3 shadow-lg">
        <form action={renameFolder} className="flex gap-2">
          <input type="hidden" name="id" value={folder.id} />
          <Input name="icon" defaultValue={folder.icon} maxLength={8} className="!w-14 text-center" aria-label="Emoji" />
          <Input name="name" defaultValue={folder.name} required className="min-w-0 flex-1" aria-label="Folder name" />
          <SubmitButton variant="secondary">Save</SubmitButton>
        </form>
        <DeleteButton action={deleteFolder} id={folder.id} label="Delete folder" confirmText={`Delete the ${folder.name} folder? Its ${folder.n} file(s) are kept and move to "Not in a folder".`} />
      </div>
    </details>
  );
}
