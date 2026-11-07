"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { btn } from "@/components/ui";

/** Opens the print window once the report has loaded (choose "Save as PDF" there), plus a button to do it again. */
export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <button type="button" onClick={() => window.print()} className={btn.primary}>
      <Printer size={16} /> Print / Save as PDF
    </button>
  );
}
