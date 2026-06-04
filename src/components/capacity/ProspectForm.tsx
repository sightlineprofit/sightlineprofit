import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createProspect } from "@/lib/prospects.functions";
import { fmtUsd } from "@/lib/finance";

type SopTemplate = { id: string; name: string; total_hrs: number };

export function ProspectFormSheet({
  open,
  onOpenChange,
  sopTemplates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sopTemplates: SopTemplate[];
}) {
  const qc = useQueryClient();
  const create = useServerFn(createProspect);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [billingType, setBillingType] = useState<"fixed" | "hourly">("fixed");
  const [fixedFee, setFixedFee] = useState<string>("");
  const [scopedRate, setScopedRate] = useState<string>("");
  const [estimatedHrs, setEstimatedHrs] = useState<string>("");
  const [probability, setProbability] = useState<string>("50");
  const [estimatedStart, setEstimatedStart] = useState<string>("");
  const [estimatedEnd, setEstimatedEnd] = useState<string>("");
  const [sopTemplateId, setSopTemplateId] = useState<string>("");

  function reset() {
    setName(""); setClientName(""); setBillingType("fixed"); setFixedFee("");
    setScopedRate(""); setEstimatedHrs(""); setProbability("50");
    setEstimatedStart(""); setEstimatedEnd(""); setSopTemplateId("");
  }

  const mut = useMutation({
    mutationFn: async () => {
      return create({
        data: {
          name: name.trim(),
          client_name: clientName.trim() || null,
          billing_type: billingType,
          fixed_fee: billingType === "fixed" && fixedFee ? Number(fixedFee) : null,
          scoped_rate: billingType === "hourly" && scopedRate ? Number(scopedRate) : null,
          estimated_hrs: estimatedHrs ? Number(estimatedHrs) : null,
          probability_pct: Number(probability) || 50,
          estimated_start: estimatedStart || null,
          estimated_end: estimatedEnd || null,
          sop_template_id: sopTemplateId || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Prospect added to your pipeline");
      qc.invalidateQueries();
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save prospect"),
  });

  function onTemplateSelect(id: string) {
    setSopTemplateId(id);
    const t = sopTemplates.find((x) => x.id === id);
    if (t && billingType === "hourly" && !estimatedHrs) {
      setEstimatedHrs(String(t.total_hrs));
    }
  }

  const preview = useMemo(() => {
    const hrs = Number(estimatedHrs) || 0;
    const prob = Math.min(100, Math.max(0, Number(probability) || 0));
    const value =
      billingType === "fixed"
        ? Number(fixedFee) || 0
        : hrs * (Number(scopedRate) || 0);
    return { hrs, prob, value };
  }, [estimatedHrs, probability, billingType, fixedFee, scopedRate]);

  const valid = name.trim().length > 0 && Number(probability) >= 1 && Number(probability) <= 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle
            className="text-[22px] font-normal"
            style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
          >
            Add a prospect to your pipeline
          </SheetTitle>
          <SheetDescription
            className="text-[12px] font-light"
            style={{ fontFamily: "Jost, sans-serif", color: "#aaa" }}
          >
            Prospects appear in your capacity view so you can see likely future load.
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !mut.isPending) mut.mutate();
          }}
        >
          <Field label="Project / prospect name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>

          <Field label="Client name">
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Potential client name"
              maxLength={200}
            />
          </Field>

          <Field label="Billing type">
            <div className="flex gap-4 text-sm">
              {(["fixed", "hourly"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={billingType === t}
                    onChange={() => setBillingType(t)}
                  />
                  {t === "fixed" ? "Fixed fee" : "Hourly"}
                </label>
              ))}
            </div>
          </Field>

          {billingType === "fixed" ? (
            <Field label="Estimated project fee ($)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={fixedFee}
                onChange={(e) => setFixedFee(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Estimated hourly rate ($)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={scopedRate}
                  onChange={(e) => setScopedRate(e.target.value)}
                />
              </Field>
              <Field label="Estimated total hours">
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={estimatedHrs}
                  onChange={(e) => setEstimatedHrs(e.target.value)}
                />
              </Field>
            </>
          )}

          {billingType === "fixed" && (
            <Field label="Estimated total hours">
              <Input
                type="number"
                min={0}
                step="0.5"
                value={estimatedHrs}
                onChange={(e) => setEstimatedHrs(e.target.value)}
              />
            </Field>
          )}

          <Field
            label="How likely is this to convert? (%)"
            help="This weights how the hours show in your capacity view. Be honest — optimistic probabilities skew your planning."
          >
            <Input
              type="number"
              min={1}
              max={100}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Likely start date">
              <Input type="date" value={estimatedStart} onChange={(e) => setEstimatedStart(e.target.value)} />
            </Field>
            <Field label="Likely end date">
              <Input type="date" value={estimatedEnd} onChange={(e) => setEstimatedEnd(e.target.value)} />
            </Field>
          </div>

          {sopTemplates.length > 0 && (
            <Field
              label="Attach a workflow template"
              help="Optional. Picking one auto-fills estimated hours for hourly prospects."
            >
              <select
                value={sopTemplateId}
                onChange={(e) => onTemplateSelect(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— No template —</option>
                {sopTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.total_hrs} hrs)
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="rounded-lg border border-border bg-cream/40 p-3 text-xs">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ch/50">
              In your capacity view this prospect will show as:
            </div>
            <div className="text-ch">
              <span className="font-medium">{name.trim() || "Unnamed prospect"}</span>
              {" · "}
              <span className="num">{preview.prob}%</span> probability
            </div>
            <div className="text-ch/70">
              Estimated hours: <span className="num">{preview.hrs.toFixed(1)} hrs</span>
              {estimatedStart && estimatedEnd ? (
                <> · {estimatedStart} → {estimatedEnd}</>
              ) : null}
            </div>
            {preview.value > 0 && (
              <div className="text-ch/70">
                Potential value:{" "}
                <span className="num">
                  {billingType === "fixed" ? fmtUsd(preview.value) : `~${fmtUsd(preview.value)}`}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-sm text-ch/60 hover:text-ch"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={!valid || mut.isPending}
              style={{ background: "#B8860B", color: "white" }}
            >
              {mut.isPending ? "Adding…" : "Add to pipeline"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-ch/60">
        {label} {required && <span className="text-gold">*</span>}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] font-light text-ch/50">{help}</p>}
    </div>
  );
}