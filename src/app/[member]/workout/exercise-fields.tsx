"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Exercise, Kind } from "@/lib/workout";

const KINDS: [Kind, string][] = [
  ["weights", "Weights (sets × reps × kg)"],
  ["bodyweight", "Bodyweight (sets × reps)"],
  ["time", "Timed (sets × seconds)"],
  ["distance", "Distance (km)"],
];

/** An exercise's name, type and target – only the boxes that type needs. */
export function ExerciseFields({ e }: { e?: Exercise }) {
  const [kind, setKind] = useState<Kind>(e?.kind ?? "weights");
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Exercise"><Input name="name" required defaultValue={e?.name ?? ""} placeholder="Bench press, Run, Plank…" autoComplete="off" /></Field>
        <Field label="Type"><Select name="kind" value={kind} onChange={(x) => setKind(x.target.value as Kind)} options={KINDS} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {kind !== "distance" && <Field label="Sets"><Input name="sets" type="number" min={1} max={20} inputMode="numeric" defaultValue={e?.sets ?? 3} /></Field>}
        {(kind === "weights" || kind === "bodyweight") && <Field label="Reps"><Input name="reps" type="number" min={0} inputMode="numeric" defaultValue={e?.reps ?? ""} placeholder="8" /></Field>}
        {kind === "weights" && <Field label="kg (start)"><Input name="weight" inputMode="decimal" defaultValue={e?.weight ?? ""} placeholder="optional" /></Field>}
        {kind === "time" && <Field label="Seconds"><Input name="seconds" type="number" min={0} inputMode="numeric" defaultValue={e?.seconds ?? ""} placeholder="30" /></Field>}
        {kind === "distance" && <Field label="km"><Input name="distance" inputMode="decimal" defaultValue={e?.distance ?? ""} placeholder="5" /></Field>}
        {kind === "distance" && <Field label="Target time (s)"><Input name="seconds" type="number" min={0} inputMode="numeric" defaultValue={e?.seconds ?? ""} placeholder="optional" /></Field>}
      </div>
      <Field label="Notes (optional)"><Input name="notes" defaultValue={e?.notes ?? ""} placeholder="Seat height 4, slow on the way down…" /></Field>
    </div>
  );
}
