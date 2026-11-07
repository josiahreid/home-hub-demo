"use client";

import { Select } from "@/components/ui";

/** A select that submits its own little form as soon as it changes (e.g. inline status). */
export function AutoSelect({ action, id, name, value, options, label }: {
  action: (fd: FormData) => Promise<void>;
  id: number;
  name: string;
  value: string;
  options: (string | [string, string])[];
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Select
        name={name}
        defaultValue={value}
        aria-label={label}
        options={options}
        className="!w-auto !py-1 !text-xs"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
