import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil } from "lucide-react";
import { Input, btn, cx } from "@/components/ui";
import { moveFeed, renameFeed, toggleFeedHidden } from "./feed-actions";

/** Up / down / hide / rename buttons on an imported calendar's heading. */
export function FeedControls({ id, name, hidden, first, last }: { id: number; name: string; hidden: boolean; first: boolean; last: boolean }) {
  const small = cx(btn.secondary, btn.small);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <form action={moveFeed}>
        <input type="hidden" name="id" value={id} />
        <button name="dir" value="up" className={small} disabled={first} aria-label="Move this calendar up" title="Move up"><ArrowUp size={14} /></button>
      </form>
      <form action={moveFeed}>
        <input type="hidden" name="id" value={id} />
        <button name="dir" value="down" className={small} disabled={last} aria-label="Move this calendar down" title="Move down"><ArrowDown size={14} /></button>
      </form>
      <form action={toggleFeedHidden}>
        <input type="hidden" name="id" value={id} />
        <button className={small}>{hidden ? <><Eye size={14} /> Show</> : <><EyeOff size={14} /> Hide</>}</button>
      </form>
      <details className="relative" key={name}>
        <summary className={cx(small, "list-none [&::-webkit-details-marker]:hidden")}><Pencil size={14} /> Rename</summary>
        {/* opens leftwards from the button, and never wider than a phone screen */}
        <form action={renameFeed} className="absolute right-0 z-10 mt-1 flex w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-line bg-surface p-2 shadow-lg">
          <input type="hidden" name="id" value={id} />
          <Input name="name" defaultValue={name} required maxLength={80} aria-label="Calendar name" />
          <button className={cx(btn.primary, btn.small)}>Save</button>
        </form>
      </details>
    </div>
  );
}
