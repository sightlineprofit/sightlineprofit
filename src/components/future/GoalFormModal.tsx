import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FirmGoalRow } from "@/lib/goals";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "time",
  "income",
  "team",
  "clients",
  "firm",
  "personal",
  "other",
] as const;

const METRICS = [
  { value: "", label: "None (I'll check manually)" },
  { value: "annual_draw", label: "Annual owner pay" },
  { value: "weekly_hours", label: "Weekly hours average" },
  { value: "min_project_fee", label: "Minimum project fee" },
  { value: "team_headcount", label: "Team headcount" },
] as const;

export type GoalFormValues = {
  id?: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  timeframe: "this_year" | "next_year" | "someday";
  target_date: string | null;
  target_value: number | null;
  linked_metric: string | null;
  createMilestone?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: FirmGoalRow | null;
  defaultTimeframe?: GoalFormValues["timeframe"];
  onSave: (values: GoalFormValues) => void;
  saving?: boolean;
};

export function GoalFormModal({
  open,
  onOpenChange,
  initial,
  defaultTimeframe = "this_year",
  onSave,
  saving,
}: Props) {
  const [trackOpen, setTrackOpen] = useState(!!initial?.linked_metric);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    (initial?.category as (typeof CATEGORIES)[number]) ?? "other",
  );
  const [timeframe, setTimeframe] = useState<GoalFormValues["timeframe"]>(
    (initial?.timeframe as GoalFormValues["timeframe"]) ?? "this_year",
  );
  const [targetDate, setTargetDate] = useState(initial?.target_date?.slice(0, 10) ?? "");
  const [linkedMetric, setLinkedMetric] = useState(initial?.linked_metric ?? "");
  const [targetValue, setTargetValue] = useState(
    initial?.target_value != null ? String(initial.target_value) : "",
  );

  const resetFromInitial = () => {
    setName(initial?.name ?? "");
    setCategory((initial?.category as (typeof CATEGORIES)[number]) ?? "other");
    setTimeframe(
      (initial?.timeframe as GoalFormValues["timeframe"]) ?? defaultTimeframe,
    );
    setTargetDate(initial?.target_date?.slice(0, 10) ?? "");
    setLinkedMetric(initial?.linked_metric ?? "");
    setTargetValue(initial?.target_value != null ? String(initial.target_value) : "");
    setTrackOpen(!!initial?.linked_metric);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetFromInitial();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[520px] rounded-xl px-8 py-7">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-normal text-ch">
            {initial ? "Edit goal" : "Add goal"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          <div>
            <Label className="font-sans text-xs font-medium text-ch">What do you want?</Label>
            <Input
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Take Fridays off by September"
            />
            <p className="mt-1 font-sans text-[11px] italic text-ch/60">
              Write it in your own words — as specific or as open as you want.
            </p>
          </div>

          <div>
            <Label className="font-sans text-xs font-medium text-ch">What kind of goal is this?</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-md border px-3.5 py-1.5 font-sans text-xs font-medium capitalize",
                    category === c
                      ? "border-ch bg-ch text-cream"
                      : "border-border bg-cream text-ch/75 hover:border-ch/30",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="font-sans text-xs font-medium text-ch">When do you want this?</Label>
            <div className="mt-2 flex gap-1">
              {(
                [
                  ["this_year", "This year"],
                  ["next_year", "Next year"],
                  ["someday", "Someday"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTimeframe(v)}
                  className={cn(
                    "rounded-full px-3 py-1 font-sans text-xs",
                    timeframe === v ? "bg-ch text-cream" : "text-ch/70 hover:text-ch",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {timeframe !== "someday" && (
            <div>
              <Label className="font-sans text-xs font-medium text-ch">By when (optional)</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          )}

          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between font-sans text-xs font-medium text-ch"
              onClick={() => setTrackOpen((o) => !o)}
            >
              Track against your Sightline data
              <span className="text-ch/50">{trackOpen ? "▾" : "▸"}</span>
            </button>
            {trackOpen && (
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-cream/50 p-3">
                <p className="font-sans text-[12px] leading-relaxed text-ch/70">
                  Sightline can show whether your firm is on track using your real data.
                </p>
                <select
                  className="w-full rounded-md border border-border bg-white px-2 py-2 font-sans text-sm text-ch"
                  value={linkedMetric}
                  onChange={(e) => setLinkedMetric(e.target.value)}
                >
                  {METRICS.map((m) => (
                    <option key={m.value || "none"} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {linkedMetric && (
                  <Input
                    type="number"
                    placeholder="Target value"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              disabled={!name.trim() || saving}
              onClick={() =>
                onSave({
                  id: initial?.id,
                  name: name.trim(),
                  category,
                  timeframe,
                  target_date: targetDate || null,
                  target_value: targetValue ? Number(targetValue) : null,
                  linked_metric: linkedMetric || null,
                })
              }
            >
              Save goal →
            </Button>
            <button
              type="button"
              className="font-sans text-sm text-ch/70 underline hover:text-ch"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
