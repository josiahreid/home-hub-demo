"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, FolderOpen, X } from "lucide-react";
import { btn, cx } from "./ui";

/**
 * File field with a "Take photo" button that opens the device camera directly,
 * plus "Choose file" for PDFs or existing photos. Whichever is used ends up in the
 * one named input, so the form submits it like any other file field.
 */
export function CameraUpload({ name = "file", required, accept = "image/*,application/pdf" }: {
  name?: string;
  required?: boolean;
  accept?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ name: string; preview: string | null } | null>(null);

  // free the preview image when it's replaced or the form is reset
  useEffect(() => () => { if (picked?.preview) URL.revokeObjectURL(picked.preview); }, [picked]);

  function show(file: File | undefined) {
    setPicked(file ? { name: file.name, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null } : null);
  }

  function fromCamera(file: File | undefined) {
    if (!file || !fileInput.current) return;
    // move the photo into the real (named) input
    const dt = new DataTransfer();
    dt.items.add(new File([file], file.name || `photo-${Date.now()}.jpg`, { type: file.type || "image/jpeg" }));
    fileInput.current.files = dt.files;
    show(file);
  }

  function clear() {
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    setPicked(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cameraInput.current?.click()} className={cx(btn.primary, "flex-1 sm:flex-none")}>
          <Camera size={16} /> Take photo
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={cx(btn.secondary, "flex-1 sm:flex-none")}>
          <FolderOpen size={16} /> Choose file
        </button>
      </div>

      {/* camera: no name, so only the named input below is submitted */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => fromCamera(e.target.files?.[0])} />
      {/* visually hidden but still focusable/validatable so "required" works */}
      <input
        ref={fileInput}
        type="file"
        name={name}
        accept={accept}
        required={required}
        onChange={(e) => show(e.target.files?.[0])}
        className="sr-only"
        tabIndex={-1}
      />

      {picked ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-2">
          {picked.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.preview} alt="" className="h-16 w-16 rounded-md object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-md bg-surface"><FileText size={22} className="text-muted" /></span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{picked.name}</span>
          <button type="button" onClick={clear} aria-label="Remove" className={cx(btn.ghost, btn.small)}><X size={14} /></button>
        </div>
      ) : (
        <p className="text-xs text-muted">Take a photo of the paper copy, or choose a PDF or photo you already have.</p>
      )}
    </div>
  );
}
