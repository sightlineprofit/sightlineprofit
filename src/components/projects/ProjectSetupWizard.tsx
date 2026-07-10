import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ArrowLeft, ArrowRight, Library } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createProject } from "@/lib/sightline.functions";
import { listSopTemplatesLite } from "@/lib/sightline.functions";
import { getSopTemplatePhases } from "@/lib/sop.functions";

export type WizardPhase = {
  name: string;
  expected_hrs: number;
  billable: boolean;
};

export type PricingMethod = "flat" | "hourly" | "hybrid";

export type ProjectSetupWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
  templateId?: string | null;
  templateName?: string | null;
  initialPhases?: WizardPhase[];
};

export function ProjectSetupWizard({
  open, onClose, onCreated, templateId, templateName, initialPhases,
}: ProjectSetupWizardProps) {
  const createFn = useServerFn(createProject);
  const listTemplatesFn = useServerFn(listSopTemplatesLite);
  const getTemplatePhasesFn = useServerFn(getSopTemplatePhases);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [pricing, setPricing] = useState<PricingMethod>("flat");
  const [fee, setFee] = useState("");
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [phases, setPhases] = useState<WizardPhase[]>(initialPhases ?? []);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [appendingId, setAppendingId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey: ["wizard-sop-templates"],
    queryFn: () => listTemplatesFn(),
    enabled: open && step === 2,
    staleTime: 60_000,
  });

  async function appendTemplate(id: string, name: string) {
    setAppendingId(id);
    try {
      const res = await getTemplatePhasesFn({ data: { template_id: id } });
      const incoming = (res?.phases ?? []) as WizardPhase[];
      if (!incoming.length) {
        toast.info(`"${name}" has no phases to append.`);
        return;
      }
      setPhases((phs) => [...phs, ...incoming]);
      toast.success(`Appended ${incoming.length} phase${incoming.length === 1 ? "" : "s"} from ${name}.`);
      setLibraryOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load template");
    } finally {
      setAppendingId(null);
    }
  }

  // Re-seed phases when the wizard is reopened with a different template.
  const seededKey = useMemo(
    () => `${templateId ?? "none"}::${(initialPhases ?? []).length}`,
    [templateId, initialPhases],
  );
  const [lastSeed, setLastSeed] = useState<string | null>(null);
  if (open && seededKey !== lastSeed) {
    setPhases(initialPhases ?? []);
    setLastSeed(seededKey);
  }

  function reset() {
    setStep(1);
    setName(""); setClientName("");
    setPricing("flat"); setFee(""); setRate("");
    setStartDate(""); setEndDate("");
    setPhases(initialPhases ?? []);
    setLastSeed(null);
  }

  function handleClose() {
    onClose();
    // defer reset so the closing animation shows the last state
    setTimeout(reset, 200);
  }

  const canAdvance =
    name.trim().length > 0 &&
    (pricing === "hourly" || (Number(fee) > 0)) &&
    (pricing === "flat" || pricing === "hybrid" || Number(rate) >= 0);

  const createMut = useMutation({
    mutationFn: async () => {
      const trimmedPhases = phases
        .map((p) => ({
          name: p.name.trim(),
          expected_hrs: Number(p.expected_hrs) || 0,
          billable: !!p.billable,
        }))
        .filter((p) => p.name.length > 0);
      return createFn({
        data: {
          name: name.trim(),
          client_name: clientName.trim() || null,
          status: "active",
          scoped_rate:
            pricing === "hourly" || pricing === "hybrid"
              ? (rate ? Number(rate) : null)
              : null,
          fixed_fee:
            pricing === "flat" || pricing === "hybrid"
              ? (fee ? Number(fee) : null)
              : null,
          start_date: startDate || null,
          end_date: endDate || null,
          sop_template_id: templateId ?? null,
          phases: trimmedPhases.length ? trimmedPhases : null,
        },
      });
    },
    onSuccess: (res: { id: string }) => {
      toast.success("Project created");
      // Signal the guided tour (Step 6) regardless of whether the
      // `projects` table is in the Supabase realtime publication.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sightline:project-created", { detail: { id: res.id } }),
        );
      }
      onCreated(res.id);
      handleClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const totalHrs = phases.reduce((s, p) => s + (Number(p.expected_hrs) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {step === 1 ? "Set up your project" : "Review and adjust your scope of work"}
          </DialogTitle>
          <p className="text-sm text-ch/60">
            {step === 1
              ? "A few details to get started."
              : templateName
                ? <>These phases come from your <span className="text-ch">{templateName}</span> template. Edit hours to match this project.</>
                : "Define the phases and estimated hours for this project."}
          </p>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-12 gap-3 py-2">
            <Field className="col-span-12" label="Project name *">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith Residence — Full Renovation" />
            </Field>
            <Field className="col-span-12" label="Client name">
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Optional" />
            </Field>
            <Field className="col-span-12" label="Pricing method *">
              <div className="grid grid-cols-3 gap-2">
                {(["flat","hourly","hybrid"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPricing(k)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                      pricing === k ? "border-ch bg-ch text-white" : "border-border bg-white text-ch/80 hover:border-ch/40",
                    )}
                  >
                    {k === "flat" ? "Flat fee" : k === "hourly" ? "Hourly" : "Hybrid"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ch/50">
                {pricing === "flat" && "One fixed project fee."}
                {pricing === "hourly" && "Billed at an hourly rate."}
                {pricing === "hybrid" && "Flat fee plus hourly phases."}
              </p>
            </Field>
            {(pricing === "flat" || pricing === "hybrid") && (
              <Field className="col-span-6" label="Project fee *">
                <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="$25,000" />
              </Field>
            )}
            {(pricing === "hourly" || pricing === "hybrid") && (
              <Field className="col-span-6" label={pricing === "hybrid" ? "Hourly rate (hybrid phases)" : "Hourly rate *"}>
                <Input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$250" />
              </Field>
            )}
            <Field className="col-span-6" label="Estimated start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field className="col-span-6" label="Estimated end date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border bg-cream/50 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-ch/60">
              Total scoped: <span className="text-ch">{totalHrs.toFixed(1)} hrs</span> · {phases.length} phase{phases.length === 1 ? "" : "s"}
            </div>
            {phases.length === 0 && (
              <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-ch/60">
                No phases yet. Add your first phase below.
              </p>
            )}
            <div className="space-y-2">
              {phases.map((p, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-md border border-border bg-white p-2">
                  <div className="col-span-6">
                    <Input
                      value={p.name}
                      onChange={(e) => setPhases((phs) => phs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Phase name"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number" min={0} step="any"
                      value={String(p.expected_hrs)}
                      onChange={(e) => setPhases((phs) => phs.map((x, j) => j === i ? { ...x, expected_hrs: Number(e.target.value) || 0 } : x))}
                      placeholder="hrs"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch
                      checked={p.billable}
                      onCheckedChange={(v) => setPhases((phs) => phs.map((x, j) => j === i ? { ...x, billable: v } : x))}
                    />
                    <span className="text-[11px] text-ch/60">{p.billable ? "Billable" : "Non-bill"}</span>
                  </div>
                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => setPhases((phs) => phs.filter((_, j) => j !== i))}
                      className="text-ch/40 hover:text-terra"
                      aria-label="Remove phase"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-dashed border-border"
                onClick={() => setPhases((phs) => [...phs, { name: "", expected_hrs: 0, billable: true }])}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add phase
              </Button>
              <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-dashed border-border">
                    <Library className="mr-1.5 h-4 w-4" /> Append from SOP library
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-ch/60">
                    SOP templates
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {templatesQ.isLoading ? (
                      <p className="px-3 py-4 text-sm text-ch/60">Loading templates…</p>
                    ) : (templatesQ.data?.templates?.length ?? 0) === 0 ? (
                      <p className="px-3 py-4 text-sm text-ch/60">
                        No SOP templates yet. Create one in the SOP Library, then come back here.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {templatesQ.data!.templates.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              disabled={appendingId === t.id}
                              onClick={() => appendTemplate(t.id, t.name)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cream/60 disabled:opacity-60"
                            >
                              <span>
                                <span className="block text-ch">{t.name}</span>
                                {t.category ? (
                                  <span className="block text-[11px] text-ch/50">{t.category}</span>
                                ) : null}
                              </span>
                              <Plus className="h-4 w-4 text-ch/50" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {step === 2 ? (
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          )}
          {step === 1 ? (
            <Button
              disabled={!canAdvance}
              onClick={() => setStep(2)}
              className="bg-gold text-white hover:bg-goldl"
            >
              Create project and add scope <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
              className="bg-ch text-cream hover:bg-ch/90"
            >
              {createMut.isPending ? "Creating…" : "Finish setup →"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">{label}</Label>
      {children}
    </div>
  );
}