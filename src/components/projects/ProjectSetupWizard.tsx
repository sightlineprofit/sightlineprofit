import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createProject } from "@/lib/sightline.functions";
import { listProjectWorkflows, getSopTemplatePhases } from "@/lib/sop.functions";
import { getMyContext, listFirmMembers } from "@/lib/firm.functions";
import { avatarColor, memberInitials } from "@/components/my-work/MyWorkPageContent";
import { getDashboardData } from "@/lib/dashboard.functions";
import { calc, fmtUsd } from "@/lib/finance";
import { normalizePricingStructure } from "@/lib/pricing-structure";
import { ProjectWorkflowPicker, type WorkflowPhasePreview, type WorkflowPickerOption } from "@/components/sop/ProjectWorkflowPicker";
import { orderWorkflowIdsForAttach } from "@/lib/sop-workflow-order";
import { CLIENT_COMMUNICATION_OPTIONS } from "@/lib/client-contact";

export type WizardPhase = {
  name: string;
  expected_hrs: number;
  billable: boolean;
};

export type PricingMethod = "flat" | "hourly" | "hybrid" | "retainer";

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
  const listWorkflowsFn = useServerFn(listProjectWorkflows);
  const getTemplatePhasesFn = useServerFn(getSopTemplatePhases);
  const ctxFn = useServerFn(getMyContext);
  const dashFn = useServerFn(getDashboardData);
  const ctxQ = useQuery({ queryKey: ["me"], queryFn: () => ctxFn(), staleTime: 60_000 });
  const dashQ = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => dashFn(),
    enabled: open,
    staleTime: 30_000,
  });
  const firmConfig = ctxQ.data?.config as { rate_billed?: number | null; pricing_structure?: string } | null | undefined;
  const pricingStructure = normalizePricingStructure(firmConfig?.pricing_structure);
  const isFlatFeeFirm = pricingStructure === "flat_fee";
  const firmRate = Number(firmConfig?.rate_billed) || 0;
  const alignedRate = useMemo(
    () =>
      calc(dashQ.data?.config ?? null, dashQ.data?.expenses ?? [], {
        ownerComp: (dashQ.data as { ownerComp?: unknown[] } | undefined)?.ownerComp ?? [],
        teamProfiles: (dashQ.data as { teamBurdens?: unknown[] } | undefined)?.teamBurdens ?? [],
      }).alignedRate,
    [dashQ.data],
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCommPref, setClientCommPref] = useState("");
  const [pricing, setPricing] = useState<PricingMethod>(isFlatFeeFirm ? "flat" : "flat");
  const [fee, setFee] = useState("");
  const [hourlyHours, setHourlyHours] = useState("");
  const [retainerMonthly, setRetainerMonthly] = useState("");
  const [retainerStartDate, setRetainerStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [phases, setPhases] = useState<WizardPhase[]>(initialPhases ?? []);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>(templateId ? [templateId] : []);
  const [workflowPeriodLabel, setWorkflowPeriodLabel] = useState("");
  const [workflowPeriodStart, setWorkflowPeriodStart] = useState("");
  const [workflowPeriodEnd, setWorkflowPeriodEnd] = useState("");
  const [previewTaskCount, setPreviewTaskCount] = useState(0);
  const [teamPick, setTeamPick] = useState<Record<string, { checked: boolean; role: string }>>({});

  const membersFn = useServerFn(listFirmMembers);
  const membersQ = useQuery({
    queryKey: ["wizard-firm-members"],
    queryFn: () => membersFn(),
    enabled: open && step === 2,
    staleTime: 60_000,
  });
  const rosterMembers = ((membersQ.data?.members ?? []) as Array<{ id: string; name: string; role_type: string }>).filter(
    (m) => m.role_type !== "principal",
  );

  const workflowsQ = useQuery({
    queryKey: ["wizard-project-workflows"],
    queryFn: () => listWorkflowsFn(),
    enabled: open && step === 2,
    staleTime: 60_000,
  });

  const workflowOptions = (workflowsQ.data?.workflows ?? []) as WorkflowPickerOption[];

  async function rebuildPhasesFromWorkflows(ids: string[]) {
    const ordered = orderWorkflowIdsForAttach(ids, workflowOptions);
    if (!ordered.length) {
      if (!templateId) setPhases([]);
      setPreviewTaskCount(0);
      return;
    }
    let taskTotal = 0;
    const merged: WizardPhase[] = [];
    for (const id of ordered) {
      const meta = workflowOptions.find((w) => w.id === id);
      taskTotal += meta?.taskCount ?? 0;
      try {
        const res = await getTemplatePhasesFn({ data: { template_id: id } });
        for (const p of (res?.phases ?? []) as WizardPhase[]) {
          merged.push(p);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load workflow");
        return;
      }
    }
    setPreviewTaskCount(taskTotal);
    setPhases(merged);
  }

  useEffect(() => {
    if (!open) return;
    if (isFlatFeeFirm) setPricing("flat");
  }, [open, isFlatFeeFirm]);

  useEffect(() => {
    if (!open || step !== 2 || !templateId) return;
    if (selectedWorkflowIds.includes(templateId) && workflowOptions.length) {
      void rebuildPhasesFromWorkflows(selectedWorkflowIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed phases when workflows load on step 2
  }, [open, step, templateId, workflowsQ.dataUpdatedAt]);

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
    setClientEmail(""); setClientPhone(""); setClientCommPref("");
    setPricing(isFlatFeeFirm ? "flat" : "flat"); setFee(""); setHourlyHours("");
    setRetainerMonthly("");
    setRetainerStartDate(new Date().toISOString().slice(0, 10));
    setStartDate(""); setEndDate("");
    setPhases(initialPhases ?? []);
    setSelectedWorkflowIds(templateId ? [templateId] : []);
    setWorkflowPeriodLabel("");
    setWorkflowPeriodStart("");
    setWorkflowPeriodEnd("");
    setPreviewTaskCount(0);
    setLastSeed(null);
    setTeamPick({});
  }

  function handleClose() {
    onClose();
    // defer reset so the closing animation shows the last state
    setTimeout(reset, 200);
  }

  const feeNum = Number(fee) || 0;
  const hourlyHrsNum = Number(hourlyHours) || 0;
  const retainerMonthlyNum = Number(retainerMonthly) || 0;
  const canAdvance =
    name.trim().length > 0 &&
    (pricing === "hourly"
      ? true
      : pricing === "flat"
        ? feeNum > 0
        : pricing === "retainer"
          ? retainerMonthlyNum > 0 && !!retainerStartDate
          : feeNum > 0 && hourlyHrsNum > 0);

  // Live revenue preview for hybrid (flat + hourly_hrs × firm rate). Hourly
  // revenue for hourly-only projects is scoped_hrs × rate, computed after
  // Step 2 (phases), so we don't preview it here.
  const hybridRevenue = feeNum + hourlyHrsNum * firmRate;

  const createMut = useMutation({
    mutationFn: async () => {
      const orderedWorkflowIds = orderWorkflowIdsForAttach(selectedWorkflowIds, workflowOptions);
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
          client_email: clientEmail.trim() || null,
          client_phone: clientPhone.trim() || null,
          client_preferred_communication:
            clientCommPref && ["email", "phone", "text", "in_person"].includes(clientCommPref)
              ? (clientCommPref as "email" | "phone" | "text" | "in_person")
              : null,
          status: "active",
          scoped_rate:
            pricing === "hourly" || pricing === "hybrid" ? firmRate || null : null,
          fixed_fee:
            pricing === "flat" || pricing === "hybrid"
              ? feeNum > 0
                ? feeNum
                : null
              : null,
          pricing_method:
            pricing === "flat"
              ? "flat_fee"
              : pricing === "hourly"
                ? "hourly"
                : pricing === "retainer"
                  ? "retainer"
                  : "hybrid",
          flat_fee_amount:
            pricing === "flat" || pricing === "hybrid"
              ? feeNum > 0
                ? feeNum
                : null
              : null,
          hourly_scoped_hours:
            pricing === "hybrid" ? (hourlyHrsNum > 0 ? hourlyHrsNum : null) : null,
          retainer_monthly_amount:
            pricing === "retainer" ? (retainerMonthlyNum > 0 ? retainerMonthlyNum : null) : null,
          monthly_retainer_fee:
            pricing === "retainer" ? (retainerMonthlyNum > 0 ? retainerMonthlyNum : null) : null,
          retainer_start_date:
            pricing === "retainer" ? retainerStartDate || null : null,
          start_date:
            pricing === "retainer"
              ? retainerStartDate || null
              : startDate || null,
          end_date: endDate || null,
          workflow_ids: orderedWorkflowIds.length ? orderedWorkflowIds : null,
          workflow_period:
            orderedWorkflowIds.length &&
            (workflowPeriodLabel.trim() || workflowPeriodStart.trim() || workflowPeriodEnd.trim())
              ? {
                  period_label: workflowPeriodLabel.trim() || null,
                  period_start: workflowPeriodStart.trim() || null,
                  period_end: workflowPeriodEnd.trim() || null,
                }
              : null,
          phases:
            orderedWorkflowIds.length || templateId
              ? null
              : trimmedPhases.length
                ? trimmedPhases
                : null,
          assignments: Object.entries(teamPick)
            .filter(([, v]) => v.checked)
            .map(([firm_member_id, v]) => ({
              firm_member_id,
              role_on_project: v.role.trim() || null,
            })),
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
        const trimmedPhaseCount = phases.filter((p) => p.name.trim().length > 0).length;
        if (trimmedPhaseCount > 0 || selectedWorkflowIds.length > 0 || templateId) {
          window.dispatchEvent(
            new CustomEvent("sightline:sop-attached", { detail: { id: res.id } }),
          );
        }
      }
      onCreated(res.id);
      handleClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const totalHrs = phases.reduce((s, p) => s + (Number(p.expected_hrs) || 0), 0);
  const suggestedMinFee = alignedRate > 0 && totalHrs > 0 ? alignedRate * totalHrs : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex max-h-[min(720px,92vh)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {step === 1 && (
          <div className="grid grid-cols-12 gap-3 py-2">
            <Field className="col-span-12" label="Project name *">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith Residence — Full Renovation" />
            </Field>
            <div className="col-span-12 rounded-md border border-border bg-cream/40 px-3 py-3">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ch/50">
                Client contact
              </p>
              <div className="grid grid-cols-12 gap-3">
                <Field className="col-span-12 sm:col-span-6" label="Contact name">
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </Field>
                <Field className="col-span-12 sm:col-span-6" label="Email">
                  <Input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="jane@example.com"
                  />
                </Field>
                <Field className="col-span-12 sm:col-span-6" label="Phone">
                  <Input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(555) 555-0100"
                  />
                </Field>
                <Field className="col-span-12 sm:col-span-6" label="Preferred communication">
                  <select
                    value={clientCommPref}
                    onChange={(e) => setClientCommPref(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm text-ch"
                  >
                    <option value="">— Select —</option>
                    {CLIENT_COMMUNICATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <Field className="col-span-12" label="Pricing method *">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { k: "flat", title: "Flat fee", blurb: "A fixed total fee for defined scope" },
                    { k: "hourly", title: "Hourly", blurb: "All time billed at your hourly rate" },
                    { k: "hybrid", title: "Hybrid", blurb: "Flat fee for design phase, hourly for coordination" },
                    { k: "retainer", title: "Retainer", blurb: "A fixed monthly fee for ongoing client work" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setPricing(opt.k)}
                    className={cn(
                      "flex h-full flex-col items-start rounded-md border px-3 py-2 text-left transition-colors",
                      pricing === opt.k
                        ? "border-ch bg-ch text-white"
                        : "border-border bg-white text-ch/80 hover:border-ch/40",
                    )}
                  >
                    <span className="text-sm font-medium">{opt.title}</span>
                    <span
                      className={cn(
                        "mt-1 text-[11px] leading-snug",
                        pricing === opt.k ? "text-white/75" : "text-ch/55",
                      )}
                    >
                      {opt.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            {pricing === "flat" && (
              <Field className="col-span-12" label="Project fee *">
                <Input
                  type="number"
                  min={0}
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="$0.00"
                />
                {isFlatFeeFirm && alignedRate > 0 && totalHrs > 0 ? (
                  <p
                    className="mt-2"
                    style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", lineHeight: 1.6 }}
                  >
                    Your aligned rate of {fmtUsd(alignedRate, { decimals: 0 })}/hr across {totalHrs.toFixed(1)} scoped
                    hours suggests a minimum fee of {fmtUsd(suggestedMinFee, { decimals: 0 })}.
                  </p>
                ) : isFlatFeeFirm && alignedRate > 0 ? (
                  <p
                    className="mt-2"
                    style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", lineHeight: 1.6 }}
                  >
                    Your aligned rate is {fmtUsd(alignedRate, { decimals: 0 })}/hr. Add scope in the next step to see a
                    suggested minimum fee.
                  </p>
                ) : null}
              </Field>
            )}
            {pricing === "hourly" && (
              <div className="col-span-12 rounded-md border border-border bg-cream/40 px-3 py-2">
                <p className="text-[11px]" style={{ color: "#8A7F75", fontFamily: "'Jost', sans-serif" }}>
                  Revenue will calculate from scoped hours × your billed rate
                  {firmRate > 0 ? ` ($${firmRate.toLocaleString("en-US")}/hr)` : " (set your billed rate in firm setup)"}.
                </p>
              </div>
            )}
            {pricing === "hybrid" && (
              <>
                <Field className="col-span-6" label="Flat fee amount *">
                  <Input
                    type="number"
                    min={0}
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    placeholder="$0.00"
                  />
                </Field>
                <Field className="col-span-6" label="Estimated hourly hours *">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={hourlyHours}
                    onChange={(e) => setHourlyHours(e.target.value)}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[11px] text-ch/50">
                    Hours billed at ${firmRate ? firmRate.toLocaleString("en-US") : "—"}/hr after flat phase ends.
                  </p>
                </Field>
                {(feeNum > 0 || hourlyHrsNum > 0) && (
                  <div className="col-span-12 rounded-md border border-border bg-white px-3 py-2">
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: "#2C2C2C", fontFamily: "'Jost', sans-serif" }}
                    >
                      Total revenue: ${hybridRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
              </>
            )}
            {pricing === "retainer" && (
              <>
                <Field className="col-span-6" label="Monthly retainer fee *">
                  <Input
                    type="number"
                    min={0}
                    value={retainerMonthly}
                    onChange={(e) => setRetainerMonthly(e.target.value)}
                    placeholder="$0/month"
                  />
                </Field>
                <Field className="col-span-6" label="Retainer start date *">
                  <Input
                    type="date"
                    value={retainerStartDate}
                    onChange={(e) => setRetainerStartDate(e.target.value)}
                  />
                </Field>
                <div className="col-span-12">
                  <p
                    style={{
                      fontFamily: "'Jost', sans-serif",
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "#8A7F75",
                      lineHeight: 1.6,
                    }}
                  >
                    Retainer projects track your monthly fee against the hours your team spends each month. This shows
                    you whether each client relationship is worth what you&apos;re charging.
                  </p>
                </div>
              </>
            )}
            {pricing !== "retainer" && (
            <>
            <Field className="col-span-6" label="Estimated start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field className="col-span-6" label="Estimated end date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <ProjectWorkflowPicker
              workflows={workflowOptions}
              loading={workflowsQ.isLoading}
              selectedIds={selectedWorkflowIds}
              onSelectionChange={(ids) => {
                setSelectedWorkflowIds(ids);
                void rebuildPhasesFromWorkflows(ids);
              }}
              previewPhases={phases as WorkflowPhasePreview[]}
              previewTaskCount={previewTaskCount}
            />

            {selectedWorkflowIds.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-cream/40 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ch/50">
                  Period for this scope (optional)
                </p>
                <Input
                  placeholder="e.g. March 2026 or Month 1"
                  value={workflowPeriodLabel}
                  onChange={(e) => setWorkflowPeriodLabel(e.target.value)}
                  className="text-[13px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={workflowPeriodStart}
                    onChange={(e) => setWorkflowPeriodStart(e.target.value)}
                    className="text-[13px]"
                  />
                  <Input
                    type="date"
                    value={workflowPeriodEnd}
                    onChange={(e) => setWorkflowPeriodEnd(e.target.value)}
                    className="text-[13px]"
                  />
                </div>
                <p className="text-[11px] text-ch/50">
                  For retainer or repeating work, label the first cycle now. You can add more periods later on the
                  project.
                </p>
              </div>
            ) : null}

            {selectedWorkflowIds.length === 0 && !templateId ? (
              <>
            {isFlatFeeFirm && pricing === "flat" && alignedRate > 0 && totalHrs > 0 ? (
              <div
                className="rounded-md border border-border bg-cream/40 px-3 py-2"
                style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", lineHeight: 1.6 }}
              >
                Your aligned rate of {fmtUsd(alignedRate, { decimals: 0 })}/hr across {totalHrs.toFixed(1)} scoped hours
                suggests a minimum fee of {fmtUsd(suggestedMinFee, { decimals: 0 })}.
              </div>
            ) : null}
            {pricing !== "retainer" ? (
            <div className="rounded-md border border-border bg-cream/50 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-ch/60">
              Total scoped: <span className="text-ch">{totalHrs.toFixed(1)} hrs</span> · {phases.length} phase{phases.length === 1 ? "" : "s"}
            </div>
            ) : null}
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
            <Button
                  variant="outline"
                  className="border-dashed border-border"
                  onClick={() => setPhases((phs) => [...phs, { name: "", expected_hrs: 0, billable: true }])}
                >
                <Plus className="mr-1.5 h-4 w-4" /> Add phase
              </Button>
              </>
            ) : (
              <div className="rounded-md border border-border bg-cream/40 px-3 py-2 text-[12px] text-muted">
                Tasks and resources from this workflow will be copied when the project is created. Adjust phase hours in
                Sightline after setup if needed.
              </div>
            )}

            <div className="mt-6 border-t border-[rgba(44,44,44,0.08)] pt-4">
              <p className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                Who&apos;s working on this project?
              </p>
              <div className="mt-2">
                {rosterMembers.map((m) => {
                  const st = teamPick[m.id] ?? { checked: false, role: "" };
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 border-b border-[rgba(44,44,44,0.08)] py-2"
                    >
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                        style={{ background: avatarColor(m.id) }}
                      >
                        {memberInitials(m.name)}
                      </div>
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                        {m.name}
                      </span>
                      {st.checked && (
                        <Input
                          value={st.role}
                          onChange={(e) =>
                            setTeamPick((p) => ({
                              ...p,
                              [m.id]: { ...st, role: e.target.value },
                            }))
                          }
                          placeholder="Role on this project"
                          className="h-8 max-w-[160px] text-[12px]"
                        />
                      )}
                      <input
                        type="checkbox"
                        checked={st.checked}
                        onChange={(e) =>
                          setTeamPick((p) => ({
                            ...p,
                            [m.id]: { checked: e.target.checked, role: p[m.id]?.role ?? "" },
                          }))
                        }
                        className="ml-auto"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                Skip for now — you can assign team members later from project details.
              </p>
            </div>
          </div>
        )}
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-border pt-4">
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