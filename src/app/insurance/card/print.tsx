"use client";

import { Printer } from "lucide-react";
import { btn } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn.primary}>
      <Printer size={16} /> Print / Save as PDF
    </button>
  );
}
