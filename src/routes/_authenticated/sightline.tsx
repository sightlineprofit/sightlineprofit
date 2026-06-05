import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, AlertTriangle, Filter, Plus, Trash2, Info, ChevronDown, Lock, History,
} from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { ModulePage } from "@/components/shell/ModulePage";
import { TierLocked } from "@/components/shell/TierLocked";
import { getMyContext } from "@/lib/firm.functions";
import {
  getProjectList, getProjectDetail, updateProjectStatus,
  createProject, upsertProjectPhase, deleteProjectPhase,
  updateProjectMeta, updateProjectFinancial, updateProjectPhaseFinancial,
  patchTimeEntry, listSopTemplatesLite,
} from "@/lib/sightline.functions";
import { attachTemplateToProject } from "@/lib/sop.functions";
import { deleteTimeEntry } from "@/lib/time.functions";
import { toast } from "sonner";
import { fmtUsd, fmtPct, formatHours, calc as calcFinance } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { ProjectCloseSummary } from "@/components/projects/ProjectCloseSummary";

type Status = "active" | "pipeline" | "pursuit" | "invoiced" | "collected" | "completed" | "on_hold";

export const Route = createFileRoute("/_authenticated/sightline")({
  head: () => ({ meta: [{ title: "Sightline — Project Profitability" }] }),
  component: SightlinePage,
});

function SightlinePage() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => ctxFn() });
  const isSuperAdmin = !!ctx?.profile?.is_super_admin;
  const isImpersonating = !!ctx?.profile?.impersonated_firm_id;
  const rawTier = (ctx?.firm?.subscription_tier as "foundation" | "studio" | "practice") ?? "foundation";
  const tier = isSuperAdmin && !isImpersonating ? "practice" : rawTier;

  const [openProject, setOpenProject] = useState<string | null>(null);

  if (tier !== "practice") {
    return (
      <ModulePage eyebrow="Practice" title="Sightline" description="Was this project actually profitable? Compare scoped hours against the truth.">
        <TierLocked
          tier="practice"
          title="Find out which projects make money"
          blurb="Most studios know their gross revenue. Few know which projects quietly drain margin. Sightline answers that — per project, per phase."
          unlocks={[
            "Per-project margin comparing scoped vs. actual hours",
            "Phase-level variance, with scope-creep alerts in dollars",
            "Project list with green / amber / red health",
            "Time-entry log filtered by member, phase, or date",
          ]}
        />
      </ModulePage>
    );
  }

  if (openProject) {
    return <ProjectDetail id={openProject} onBack={() => setOpenProject(null)} />;
  }
  return <ProjectList onOpen={setOpenProject} />;
}

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const getList = useServerFn(getProjectList);
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const { data, isLoading } = useQuery({ queryKey: ["sightline-list"], queryFn: () => getList() });
  const [filter, setFilter] = useState<"all" | Status>("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", client_name: "", scoped_rate: "", fixed_fee: "" });

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    try {
      const res = await createFn({
        data: {
          name: draft.name.trim(),
          client_name: draft.client_name.trim() || null,
          status: "active",
          scoped_rate: draft.scoped_rate ? Number(draft.scoped_rate) : null,
          fixed_fee: draft.fixed_fee ? Number(draft.fixed_fee) : null,
        },
      });
      toast.success("Project created");
      setDraft({ name: "", client_name: "", scoped_rate: "", fixed_fee: "" });
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["sightline-list"] });
      onOpen(res.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const billedRate = Number(data?.config?.rate_billed) || 0;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.projects.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return [p.name, p.client_name].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [data, filter, search]);

  return (
    <ModulePage
      eyebrow="Practice"
      title="Sightline"
      description="Project profitability, finally answered."
      actions={
        <Button onClick={() => setCreating((v) => !v)} className="bg-gold text-white hover:bg-goldl">
          {creating ? "Cancel" : <><Plus className="mr-1.5 h-4 w-4" /> New project</>}
        </Button>
      }
    >
      {creating && (
        <form onSubmit={submitCreate} className="mb-6 grid grid-cols-12 items-start gap-3 rounded-lg border border-border bg-white p-4">
          <div className="col-span-12 md:col-span-6">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Project name</label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus required />
          </div>
          <div className="col-span-12 md:col-span-6">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Client</label>
            <Input value={draft.client_name} onChange={(e) => setDraft({ ...draft, client_name: e.target.value })} />
          </div>
          <div className="col-span-12 md:col-span-6">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Hourly project rate</label>
            <Input type="number" min={0} step="any" value={draft.scoped_rate} onChange={(e) => setDraft({ ...draft, scoped_rate: e.target.value })} placeholder="$250" />
            <p className="mt-1 text-[11px] text-ch/50">The rate per hour agreed with this client — not the total project fee.</p>
          </div>
          <div className="col-span-12 md:col-span-6">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Fixed project fee $ (optional)</label>
            <Input type="number" min={0} step="any" value={draft.fixed_fee} onChange={(e) => setDraft({ ...draft, fixed_fee: e.target.value })} placeholder="$25,000" />
            <p className="mt-1 text-[11px] text-ch/50">If this is a fixed-fee project, enter the total. Leave blank if billing hourly.</p>
          </div>
          <div className="col-span-12 flex justify-end">
            <Button type="submit" className="bg-ch text-cream hover:bg-ch/90">Create project</Button>
          </div>
        </form>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="max-w-sm bg-white"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44 bg-white">
            <Filter className="mr-2 h-3.5 w-3.5 text-ch/40" /> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pipeline">Pipeline</SelectItem>
            <SelectItem value="pursuit">Pursuit (BD)</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="collected">Collected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-ch/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white/60 p-12 text-center">
          <p className="font-display text-2xl italic text-ch/60">No projects yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ch/60">
            Create your first project to start tracking profitability. You can attach an SOP template later from the SOP Library.
          </p>
          {!creating && (
            <Button onClick={() => setCreating(true)} className="mt-5 bg-gold text-white hover:bg-goldl">
              <Plus className="mr-1.5 h-4 w-4" /> Create project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const scoped = p.totals.scoped;
            const actual = p.totals.actual;
            const pctConsumed = scoped > 0 ? (actual / scoped) * 100 : 0;
            const health = healthColor(pctConsumed);
            const variance = actual - scoped;
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="group flex flex-col rounded-lg border border-border bg-white p-5 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl tracking-tight text-ch">{p.name}</h3>
                    {p.client_name && <p className="mt-0.5 text-sm text-ch/60">{p.client_name}</p>}
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ch/70">
                    {p.status}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <Cell label="Scoped" value={formatHours(scoped)} />
                  <Cell label="Actual" value={formatHours(actual)} />
                  <Cell
                    label="Variance"
                    value={`${variance >= 0 ? "+" : ""}${formatHours(Math.abs(variance))}`}
                    accent={variance > 0 ? "danger" : variance < 0 ? "success" : undefined}
                  />
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] text-ch/50">
                    <span>{pctConsumed.toFixed(0)}% consumed</span>
                    {billedRate > 0 && variance > 0 && (
                      <span>{fmtUsd(variance * billedRate)} unscoped</span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-creamd">
                    <div
                      className={cn("h-full transition-all", health.bar)}
                      style={{ width: `${Math.min(100, pctConsumed)}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </ModulePage>
  );
}

function healthColor(pct: number) {
  if (pct > 100) return { bar: "bg-terra", text: "text-terra", label: "Over" };
  if (pct >= 80) return { bar: "bg-goldl", text: "text-gold", label: "Watch" };
  return { bar: "bg-success", text: "text-success", label: "On track" };
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: "success" | "danger" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ch/50">{label}</div>
      <div className={cn("font-display text-xl text-ch",
        accent === "danger" && "text-terra",
        accent === "success" && "text-success",
      )}>{value}</div>
    </div>
  );
}


// =============================================================================
// PROJECT DETAIL
// =============================================================================

type PhaseRow = {
  id: string;
  name: string;
  expected_hrs: number;
  actual_hrs: number;
  billable: boolean;
  sop_phase_id: string | null;
  sort_order: number;
  project_id: string;
  phase_over_scope: boolean;
  sc: number;
  ac: number;
  variance: number;
  pct: number;
  billableActual: number;
  nonBillActual: number;
};

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getDetail = useServerFn(getProjectDetail);
  const statusFn = useServerFn(updateProjectStatus);
  const metaFn = useServerFn(updateProjectMeta);
  const finFn = useServerFn(updateProjectFinancial);
  const phaseFinFn = useServerFn(updateProjectPhaseFinancial);
  const upsertPhaseFn = useServerFn(upsertProjectPhase);
  const deletePhaseFn = useServerFn(deleteProjectPhase);
  const patchEntryFn = useServerFn(patchTimeEntry);
  const deleteEntryFn = useServerFn(deleteTimeEntry);
  const listTemplatesFn = useServerFn(listSopTemplatesLite);
  const attachTplFn = useServerFn(attachTemplateToProject);

  const { data, isLoading } = useQuery({
    queryKey: ["sightline-detail", id],
    queryFn: () => getDetail({ data: { id } }),
  });
  useRealtimeInvalidate(
    `sightline-detail-${id}`,
    [
      { table: "project_phases", filter: `project_id=eq.${id}` },
      { table: "time_entries", filter: `project_id=eq.${id}` },
      { table: "project_financial_audit", filter: `project_id=eq.${id}` },
    ],
    [["sightline-detail", id]],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sightline-detail", id] });
  const statusMut = useMutation({
    mutationFn: (status: Status) => statusFn({ data: { id, status } }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["sightline-list"] }); },
  });
  // Moment 3 — intercept "completed" status changes to show summary first.
  const [pendingClose, setPendingClose] = useState(false);
  const onStatusChange = (v: Status) => {
    if (v === "completed" && project?.status !== "completed") {
      setPendingClose(true);
      return;
    }
    statusMut.mutate(v);
  };

  // Tab state
  const [tab, setTab] = useState<"overview" | "phases" | "timelog">("overview");

  // Phase add/edit state (non-financial: name)
  const [addingPhase, setAddingPhase] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: "", expected_hrs: "", billable: true });

  // Financial confirm dialog state
  const [finConfirm, setFinConfirm] = useState<null | {
    label: string;
    oldDisplay: string;
    newDisplay: string;
    apply: (reason: string) => Promise<void>;
  }>(null);
  const [finReason, setFinReason] = useState("");

  // Operational edit drawer (overview details card)
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({
    name: "", client_name: "", start_date: "", end_date: "",
  });

  // Add-from-template picker state
  const [tplPickerOpen, setTplPickerOpen] = useState(false);
  const [tplPicked, setTplPicked] = useState<string>("");

  // Time log filters
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "billable" | "nonbill">("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Templates picker query
  const { data: tplData } = useQuery({
    queryKey: ["sightline-templates"],
    queryFn: () => listTemplatesFn(),
    enabled: tplPickerOpen,
  });

  const entriesForMemo = data?.entries ?? [];
  // Per-phase billable/non-bill hour split (for stacked bars).
  // Must be declared before any early return so hook order is stable
  // between the loading render and the data-ready render.
  const phaseHoursByPhase = useMemo(() => {
    const map = new Map<string, { billable: number; nonBill: number }>();
    for (const e of entriesForMemo) {
      if (!e.project_phase_id) continue;
      const cur = map.get(e.project_phase_id) ?? { billable: 0, nonBill: 0 };
      const h = Number(e.hrs || 0);
      if (e.billable) cur.billable += h; else cur.nonBill += h;
      map.set(e.project_phase_id, cur);
    }
    return map;
  }, [entriesForMemo]);

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-12">
        <button onClick={onBack} className="text-sm text-ch/60 hover:text-ch">← Back</button>
        <p className="mt-8 text-ch/50">Loading project…</p>
      </div>
    );
  }

  const { project, phases, entries, team, steps, audit, isPrincipal, isAdmin, template, config } = data;
  const projectRate = Number(project.scoped_rate) || Number(config?.rate_billed) || 0;
  const hasExplicitRate = Number(project.scoped_rate) > 0;
  const fixedFee = Number((project as { fixed_fee?: number | null }).fixed_fee) || 0;
  const isFixedFee = fixedFee > 0;
  const teamCostRates = team.map((m) => Number(m.cost_rate) || 0).filter((n) => n > 0);
  const avgCostRate = teamCostRates.length
    ? teamCostRates.reduce((s, n) => s + n, 0) / teamCostRates.length
    : (Number(config?.rate_billed) || 0) * 0.6;

  const phaseRows: PhaseRow[] = phases.map((p) => {
    const sc = Number(p.expected_hrs || 0);
    const ac = Number(p.actual_hrs || 0);
    const variance = ac - sc;
    const pct = sc > 0 ? (ac / sc) * 100 : ac > 0 ? 100 : 0;
    const split = phaseHoursByPhase.get(p.id) ?? { billable: 0, nonBill: 0 };
    return {
      ...p,
      sc, ac, variance, pct,
      billableActual: split.billable,
      nonBillActual: split.nonBill,
    };
  });

  // Aggregates
  const scopedHrs = phaseRows.reduce((s, p) => s + p.sc, 0);
  const billableScopedHrs = phaseRows.filter((p) => p.billable).reduce((s, p) => s + p.sc, 0);
  const actualHrs = phaseRows.reduce((s, p) => s + p.ac, 0);
  const billableHrs = entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
  const nonBillableHrs = entries.reduce((s, e) => s + Number(e.hrs || 0), 0) - billableHrs;
  const scopedRevenue = isFixedFee ? fixedFee : billableScopedHrs * projectRate;
  const actualRevenue = isFixedFee ? fixedFee : billableHrs * projectRate;
  const scopedCost = scopedHrs * avgCostRate;
  const actualCost = actualHrs * avgCostRate;
  const scopedMargin = scopedRevenue - scopedCost;
  const actualMargin = actualRevenue - actualCost;
  const marginVariance = actualMargin - scopedMargin;
  const marginVariancePct = scopedMargin !== 0 ? (marginVariance / Math.abs(scopedMargin)) * 100 : 0;
  const nonBillableCostAbsorbed = nonBillableHrs * avgCostRate;

  // Proportionate health + warnings
  // Tier 3 (terracotta): actual margin negative OR actual hours exceed total scoped hours
  // Tier 2 (gold): total used 80-99% of scope AND margin still positive
  // Tier 1: handled inside phase cards (per-phase over-estimate notes)
  const totalLogged = billableHrs + nonBillableHrs;
  const totalPct = scopedHrs > 0 ? (actualHrs / scopedHrs) * 100 : 0;
  const hoursRemaining = Math.max(0, scopedHrs - actualHrs);
  const hoursOver = Math.max(0, actualHrs - scopedHrs);
  const hasActuals = actualHrs > 0;

  const isOverBudget = hasActuals && (actualMargin < 0 || actualHrs > scopedHrs);
  const isHeadsUp = !isOverBudget && hasActuals && scopedHrs > 0 && totalPct >= 80 && actualMargin >= 0;

  const health: { tone: "track" | "watch" | "over"; pillLabel: string; detail: string } = isOverBudget
    ? {
        tone: "over",
        pillLabel: "Over Budget",
        detail: `${fmtUsd(actualMargin)} actual margin${hoursOver > 0 ? `  ·  ${formatHours(hoursOver)} over scope` : ""}`,
      }
    : isHeadsUp
      ? {
          tone: "watch",
          pillLabel: "Heads Up",
          detail: `${totalPct.toFixed(0)}% of budget used  ·  ${fmtUsd(actualMargin)} margin remaining`,
        }
      : {
          tone: "track",
          pillLabel: "On Track",
          detail: hasActuals
            ? `${fmtUsd(actualMargin)} margin so far  ·  ${formatHours(hoursRemaining)} remaining in budget`
            : `${fmtUsd(scopedMargin)} margin target  ·  ${formatHours(scopedHrs)} of budget`,
        };

  // Warnings panel — only Tier 2 + Tier 3 conditions surface here.
  // Individual phase overages live inside the phase card as Tier 1 notes.
  const warnings: { text: string; tone: "terra" | "gold" }[] = [];
  if (isOverBudget) {
    if (actualMargin < 0) {
      warnings.push({
        tone: "terra",
        text: `This project is currently running at a loss. Actual costs (${fmtUsd(actualCost)}) exceed actual revenue (${fmtUsd(actualRevenue)}) by ${fmtUsd(Math.abs(actualMargin))}. Review unbilled time or adjust scope.`,
      });
    }
    if (hoursOver > 0) {
      warnings.push({
        tone: "terra",
        text: `Total hours logged (${formatHours(actualHrs)}) exceed the scoped budget (${formatHours(scopedHrs)}) by ${formatHours(hoursOver)}.`,
      });
    }
  } else if (isHeadsUp) {
    warnings.push({
      tone: "gold",
      text: `You've used ${totalPct.toFixed(0)}% of your total project budget. ${formatHours(hoursRemaining)} remaining before you're at scope.`,
    });
  }
  // Tier 1 (downgraded): non-billable dominance only when total hrs >= 4 and 0 billable.
  if (totalLogged >= 4 && billableHrs === 0) {
    warnings.push({ tone: "gold", text: "All logged time on this project is non-billable." });
  }

  // Template label rule
  const phaseCount = phases.length;
  const templateLabel = template?.name
    ? `Template: ${template.name}`
    : phaseCount > 0
      ? "Custom phases"
      : "No phases yet";

  // Filter entries for Time Log tab
  const filteredEntries = entries.filter((e) => {
    if (memberFilter !== "all" && e.user_id !== memberFilter) return false;
    if (phaseFilter !== "all" && e.project_phase_id !== phaseFilter) return false;
    if (typeFilter === "billable" && !e.billable) return false;
    if (typeFilter === "nonbill" && e.billable) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    return true;
  });

  // Financial edit helpers
  const openRateConfirm = (newRate: number) => {
    const oldRate = Number(project.scoped_rate) || 0;
    if (oldRate === newRate) return;
    setFinReason("");
    setFinConfirm({
      label: "project rate",
      oldDisplay: oldRate ? fmtUsd(oldRate) + "/hr" : "(unset)",
      newDisplay: fmtUsd(newRate) + "/hr",
      apply: async (reason) => {
        await finFn({ data: { project_id: id, scoped_rate: newRate, reason: reason || null } });
        invalidate();
      },
    });
  };
  const openPhaseHrsConfirm = (p: PhaseRow, newHrs: number) => {
    if (Number(p.expected_hrs) === newHrs) return;
    setFinReason("");
    setFinConfirm({
      label: `${p.name} budgeted hours`,
      oldDisplay: formatHours(Number(p.expected_hrs)),
      newDisplay: formatHours(newHrs),
      apply: async (reason) => {
        await phaseFinFn({ data: { id: p.id, expected_hrs: newHrs, reason: reason || null } });
        invalidate();
      },
    });
  };
  const openPhaseBillableConfirm = (p: PhaseRow, newBillable: boolean) => {
    if (p.billable === newBillable) return;
    setFinReason("");
    setFinConfirm({
      label: `${p.name} billable status`,
      oldDisplay: p.billable ? "Billable" : "Non-billable",
      newDisplay: newBillable ? "Billable" : "Non-billable",
      apply: async (reason) => {
        await phaseFinFn({ data: { id: p.id, billable: newBillable, reason: reason || null } });
        invalidate();
      },
    });
  };

  // Operational edit handler
  const openMetaEdit = () => {
    setMetaDraft({
      name: project.name,
      client_name: project.client_name ?? "",
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
    });
    setEditingMeta(true);
  };
  const saveMeta = async () => {
    try {
      await metaFn({
        data: {
          id,
          name: metaDraft.name.trim() || project.name,
          client_name: metaDraft.client_name.trim() || null,
          start_date: metaDraft.start_date || null,
          end_date: metaDraft.end_date || null,
        },
      });
      setEditingMeta(false);
      toast.success("Project updated");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const attachSelectedTemplate = async () => {
    if (!tplPicked) return;
    try {
      const r = await attachTplFn({ data: { template_id: tplPicked, project_id: id } });
      toast.success(`${r.attached} phase${r.attached !== 1 ? "s" : ""} added from template`);
      setTplPickerOpen(false);
      setTplPicked("");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ch/60 hover:text-ch">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      {/* HEADER */}
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Project profitability</p>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-ch">{project.name}</h1>
            <p className="mt-1 text-ch/60">
              {project.client_name ?? "No client"}  ·  {templateLabel}  ·  {isFixedFee
                ? `Fixed fee ${fmtUsd(fixedFee)}${hasExplicitRate ? ` · ${fmtUsd(projectRate)}/hr` : ""}`
                : hasExplicitRate ? `${fmtUsd(projectRate)}/hr` : "No project rate"}
              {project.start_date && project.end_date && ` · ${project.start_date} → ${project.end_date}`}
            </p>
          </div>
          <Select value={project.status} onValueChange={(v) => onStatusChange(v as Status)}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pipeline">Pipeline</SelectItem>
              <SelectItem value="pursuit">Pursuit (BD)</SelectItem>
              <SelectItem value="invoiced">Invoiced</SelectItem>
              <SelectItem value="collected">Collected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* HEALTH PILL */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em]",
              health.tone === "track" && "bg-success/10 text-success",
              health.tone === "watch" && "bg-goldp text-gold",
              health.tone === "over" && "bg-terra/10 text-terra",
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              health.tone === "track" && "bg-success",
              health.tone === "watch" && "bg-gold",
              health.tone === "over" && "bg-terra",
            )} />
            {health.pillLabel}
          </span>
          <span className="text-sm text-ch/70">{health.detail}</span>
        </div>
      </div>

      {/* WARNINGS PANEL — only when there is something to say */}
      {warnings.length > 0 && (
        <div className="mt-6 rounded-lg border border-terra/30 bg-terra/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-terra">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="font-display text-lg">Warnings</h3>
          </div>
          <ul className="space-y-1 text-sm text-ch/80">
            {warnings.map((w, i) => (
              <li key={i} className={cn(w.tone === "gold" && "text-gold")}>· {w.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TABS */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="timelog">Time log</TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW ============ */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {!hasExplicitRate && (
            <div className="rounded-lg border border-gold/40 bg-goldp/40 p-4 text-sm text-ch/80">
              Add a project rate to see profitability figures. This is the hourly rate agreed with this client.
              <button
                className="ml-2 inline-flex items-center gap-1 font-medium text-gold hover:text-goldl"
                onClick={openMetaEdit}
              >
                Set rate →
              </button>
            </div>
          )}
          {phaseCount === 0 && (
            <div className="rounded-lg border border-border bg-white p-4 text-sm text-ch/70">
              Add phases to define your project budget. Without phases, scoped revenue cannot be calculated.
            </div>
          )}

          <ProfitabilitySummary
            projectFee={isFixedFee ? fixedFee : (hasExplicitRate ? billableScopedHrs * projectRate : 0)}
            isFixedFee={isFixedFee}
            budgetedBillableHrs={billableScopedHrs}
            actualHrs={actualHrs}
            billableHrs={billableHrs}
            nonBillableHrs={nonBillableHrs}
            rate={projectRate}
            rateIsProject={hasExplicitRate}
            firmBilledRate={Number(config?.rate_billed) || 0}
            phaseRows={phaseRows}
            startDate={project.start_date}
            endDate={project.end_date}
            hasOwnerSalary={Number(config?.comp_draw_annual ?? 0) > 0}
            alignedRate={calcFinance(config ?? null, []).alignedRate}
            onOpenSettings={openMetaEdit}
          />

          <HoursSummary
            scopedHrs={scopedHrs}
            billableHrs={billableHrs}
            nonBillableHrs={nonBillableHrs}
          />

          {/* PROJECT DETAILS CARD */}
          <div className="rounded-lg border border-border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-xl tracking-tight text-ch">Project details</h3>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={openMetaEdit}>Edit</Button>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Client</dt>
                <dd className="mt-0.5 text-ch">{project.client_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Project rate</dt>
                <dd className="mt-0.5 text-ch">{hasExplicitRate ? `${fmtUsd(projectRate)}/hr` : "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Template</dt>
                <dd className="mt-0.5 text-ch">{template?.name ?? (phaseCount > 0 ? "Custom phases" : "—")}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Start date</dt>
                <dd className="mt-0.5 text-ch">{project.start_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">End date</dt>
                <dd className="mt-0.5 text-ch">{project.end_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Team logging time</dt>
                <dd className="mt-0.5 text-ch">
                  {Array.from(new Set(entries.map((e) => e.user_id))).length || "—"}
                </dd>
              </div>
            </dl>
          </div>

          {/* FINANCIAL CHANGE HISTORY (principal-only, hidden if empty) */}
          {isPrincipal && audit.length > 0 && (
            <Collapsible>
              <div className="rounded-lg border border-border bg-white p-5">
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div className="flex items-center gap-2 text-ch">
                    <History className="h-4 w-4 text-ch/50" />
                    <h3 className="font-display text-xl tracking-tight">Financial change history</h3>
                    <span className="text-xs text-ch/50">({audit.length})</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-ch/50 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {audit.map((a) => {
                      const who = team.find((t) => t.id === a.changed_by);
                      return (
                        <li key={a.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                          <div className="text-ch/70">
                            <span className="text-ch/50">{new Date(a.changed_at).toLocaleString()}</span>
                            {"  "}
                            <span className="text-ch">{who?.name || who?.email || "Someone"}</span>
                            {" changed "}
                            <span className="text-ch">{a.field_changed}</span>
                            {" from "}<span className="text-ch">{a.old_value ?? "—"}</span>
                            {" to "}<span className="text-ch">{a.new_value ?? "—"}</span>
                          </div>
                          {a.reason && (
                            <div className="mt-1 text-xs italic text-ch/60">{a.reason}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </TabsContent>

        {/* ============ PHASES ============ */}
        <TabsContent value="phases" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-ch/60">
              {phaseCount} phase{phaseCount !== 1 && "s"} · {formatHours(scopedHrs)} scoped
              {hasExplicitRate && <> · {fmtUsd(scopedRevenue)} potential revenue</>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTplPickerOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add from SOP Library
              </Button>
              <Button size="sm" className="bg-ch text-cream hover:bg-ch/90" onClick={() => setAddingPhase(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add phase
              </Button>
            </div>
          </div>

          {addingPhase && (
            <div className="rounded-lg border border-border bg-white p-4">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-6">
                  <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Phase name</label>
                  <Input value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} autoFocus />
                </div>
                <div className="col-span-3">
                  <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Budgeted hours</label>
                  <Input type="number" min={0} step="any" value={addDraft.expected_hrs} onChange={(e) => setAddDraft({ ...addDraft, expected_hrs: e.target.value })} />
                </div>
                <div className="col-span-3 flex items-end gap-3">
                  <label className="inline-flex items-center gap-1.5 text-sm text-ch/80">
                    <input type="checkbox" checked={addDraft.billable} onChange={(e) => setAddDraft({ ...addDraft, billable: e.target.checked })} className="accent-gold" />
                    Billable
                  </label>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAddingPhase(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-ch text-cream hover:bg-ch/90"
                  onClick={async () => {
                    if (!addDraft.name.trim()) return;
                    try {
                      await upsertPhaseFn({ data: {
                        project_id: id,
                        name: addDraft.name.trim(),
                        expected_hrs: Number(addDraft.expected_hrs) || 0,
                        billable: addDraft.billable,
                      } });
                      setAddDraft({ name: "", expected_hrs: "", billable: true });
                      setAddingPhase(false);
                      invalidate();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                >
                  Add phase
                </Button>
              </div>
            </div>
          )}

          {phaseRows.length === 0 && !addingPhase && (
            <div className="rounded-lg border border-dashed border-border bg-white/60 p-8 text-center text-sm text-ch/60">
              No phases yet. Add one manually or pull from your SOP Library.
            </div>
          )}

          <div className="space-y-3">
            {phaseRows.map((p) => (
              <PhaseCard
                key={p.id}
                phase={p}
                steps={steps.filter((s) => s.project_phase_id === p.id)}
                entries={entries.filter((e) => e.project_phase_id === p.id)}
                team={team}
                isPrincipal={isPrincipal}
                isAdmin={isAdmin}
                onEditHrs={(hrs) => openPhaseHrsConfirm(p, hrs)}
                onEditBillable={(b) => openPhaseBillableConfirm(p, b)}
                onDelete={async () => {
                  if (!confirm(`Delete phase "${p.name}"?`)) return;
                  await deletePhaseFn({ data: { id: p.id } });
                  invalidate();
                }}
              />
            ))}
          </div>
        </TabsContent>

        {/* ============ TIME LOG ============ */}
        <TabsContent value="timelog" className="mt-6 space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryStat label="Total hrs" value={formatHours(billableHrs + nonBillableHrs)} />
            <SummaryStat label="Billable" value={formatHours(billableHrs)} />
            <SummaryStat label="Non-billable" value={formatHours(nonBillableHrs)} />
            <SummaryStat label="Revenue to date" value={hasExplicitRate ? fmtUsd(actualRevenue) : "—"} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {team.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Phase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                {phases.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="billable">Billable</SelectItem>
                <SelectItem value="nonbill">Non-billable</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40 bg-white" />
            <span className="text-xs text-ch/50">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40 bg-white" />
            {(memberFilter !== "all" || phaseFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setMemberFilter("all"); setPhaseFilter("all"); setTypeFilter("all"); setDateFrom(""); setDateTo(""); }}>
                Clear
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-creamd/60 text-[10px] uppercase tracking-[0.16em] text-ch/50">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Assignee</th>
                  <th className="px-3 py-3 text-left">Phase</th>
                  <th className="px-3 py-3 text-right">Hours</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  {isAdmin && <th className="px-3 py-3 w-12"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-ch/50">
                    No time logged on this project yet. Log time from the Phases tab or from the Time Calendar.
                  </td></tr>
                ) : filteredEntries.slice(0, 200).map((e) => {
                  const member = team.find((m) => m.id === e.user_id);
                  return (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-2 text-ch/80 whitespace-nowrap">{e.date}</td>
                      <td className="px-3 py-2 text-ch/80">{member?.name || member?.email || "—"}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={e.project_phase_id ?? "__none__"}
                          onValueChange={async (v) => {
                            try {
                              await patchEntryFn({ data: { id: e.id, project_phase_id: v === "__none__" ? null : v } });
                              invalidate();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-40 bg-white text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-terra">No phase</span>
                            </SelectItem>
                            {phases.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatHours(Number(e.hrs))}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={async () => {
                            try {
                              await patchEntryFn({ data: { id: e.id, billable: !e.billable } });
                              invalidate();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]",
                            e.billable ? "bg-success/10 text-success" : "bg-terra/10 text-terra",
                          )}
                        >
                          {e.billable ? "Billable" : "Non-bill"}
                        </button>
                      </td>
                      <td className="px-4 py-2 max-w-xs truncate text-ch/60">{e.notes ?? ""}</td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right">
                          {deleteConfirmId === e.id ? (
                            <div className="inline-flex gap-1">
                              <button
                                onClick={async () => {
                                  try {
                                    await deleteEntryFn({ data: { id: e.id } });
                                    setDeleteConfirmId(null);
                                    invalidate();
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Failed");
                                  }
                                }}
                                className="rounded px-2 py-0.5 text-[10px] uppercase text-terra hover:bg-terra/10"
                              >
                                Confirm
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="rounded px-2 py-0.5 text-[10px] uppercase text-ch/50 hover:bg-creamd">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirmId(e.id)} className="text-ch/40 hover:text-terra">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* OPERATIONAL EDIT DIALOG */}
      <Dialog open={editingMeta} onOpenChange={setEditingMeta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project details</DialogTitle>
            <DialogDescription>Operational fields. Financial fields (rate, hours, billable) are edited from the Phases tab.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Project name</label>
              <Input value={metaDraft.name} onChange={(e) => setMetaDraft({ ...metaDraft, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Client</label>
              <Input value={metaDraft.client_name} onChange={(e) => setMetaDraft({ ...metaDraft, client_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Start date</label>
                <Input type="date" value={metaDraft.start_date} onChange={(e) => setMetaDraft({ ...metaDraft, start_date: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">End date</label>
                <Input type="date" value={metaDraft.end_date} onChange={(e) => setMetaDraft({ ...metaDraft, end_date: e.target.value })} />
              </div>
            </div>
            {isPrincipal && (
              <div className="border-t border-border pt-3">
                <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">
                  Hourly project rate ($/hr) <span className="ml-1 text-ch/40">— financial, audited</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    id="proj-rate-input"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={project.scoped_rate ?? ""}
                    placeholder={config?.rate_billed ? String(config.rate_billed) : "—"}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const el = document.getElementById("proj-rate-input") as HTMLInputElement | null;
                      if (!el) return;
                      const v = Number(el.value);
                      if (!Number.isFinite(v) || v < 0) return;
                      openRateConfirm(v);
                    }}
                  >Update rate</Button>
                </div>
                <p className="mt-1 text-xs text-ch/50">The rate per hour agreed with this client — not the total project fee. Changes are logged.</p>

                <label className="mt-4 mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">
                  Fixed project fee $ (optional) <span className="ml-1 text-ch/40">— financial, audited</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    id="proj-fixedfee-input"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={(project as { fixed_fee?: number | null }).fixed_fee ?? ""}
                    placeholder="$25,000"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const el = document.getElementById("proj-fixedfee-input") as HTMLInputElement | null;
                      if (!el) return;
                      const raw = el.value.trim();
                      const v = raw === "" ? null : Number(raw);
                      if (v !== null && (!Number.isFinite(v) || v < 0)) return;
                      const oldVal = Number((project as { fixed_fee?: number | null }).fixed_fee) || 0;
                      if ((v ?? 0) === oldVal) return;
                      setFinReason("");
                      setFinConfirm({
                        label: "fixed project fee",
                        oldDisplay: oldVal ? fmtUsd(oldVal) : "(none)",
                        newDisplay: v ? fmtUsd(v) : "(none)",
                        apply: async (reason) => {
                          await finFn({ data: { project_id: id, fixed_fee: v, reason: reason || null } });
                          invalidate();
                        },
                      });
                    }}
                  >Update fee</Button>
                </div>
                <p className="mt-1 text-xs text-ch/50">If this is a fixed-fee project, enter the total. Leave blank if billing hourly.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingMeta(false)}>Cancel</Button>
            <Button className="bg-ch text-cream hover:bg-ch/90" onClick={saveMeta}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FINANCIAL CONFIRM DIALOG */}
      <Dialog open={!!finConfirm} onOpenChange={(o) => !o && setFinConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm financial change</DialogTitle>
            <DialogDescription>
              You are changing <span className="text-ch">{finConfirm?.label}</span> from{" "}
              <span className="text-ch">{finConfirm?.oldDisplay}</span> to{" "}
              <span className="text-ch">{finConfirm?.newDisplay}</span>. This will update scoped revenue and margin figures. Continue?
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Reason for change (optional)</label>
            <Textarea
              value={finReason}
              onChange={(e) => setFinReason(e.target.value)}
              placeholder="e.g. Client revised scope, corrected data entry error"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFinConfirm(null)}>Cancel</Button>
            <Button
              className="bg-ch text-cream hover:bg-ch/90"
              onClick={async () => {
                if (!finConfirm) return;
                try {
                  await finConfirm.apply(finReason.trim());
                  toast.success("Change saved and logged");
                  setFinConfirm(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TEMPLATE PICKER DIALOG */}
      <Dialog open={tplPickerOpen} onOpenChange={setTplPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add phases from SOP Library</DialogTitle>
            <DialogDescription>Phases are copied into this project. Future edits to the template won't affect this project.</DialogDescription>
          </DialogHeader>
          <Select value={tplPicked} onValueChange={setTplPicked}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Choose a template…" /></SelectTrigger>
            <SelectContent>
              {(tplData?.templates ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}{t.category ? ` — ${t.category}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTplPickerOpen(false)}>Cancel</Button>
            <Button className="bg-ch text-cream hover:bg-ch/90" disabled={!tplPicked} onClick={attachSelectedTemplate}>
              Attach phases
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// PROFITABILITY SUMMARY — "Is the fee enough for the time this is taking?"
// =============================================================================

function ProfitabilitySummary(props: {
  projectFee: number;
  isFixedFee: boolean;
  budgetedBillableHrs: number;
  actualHrs: number;
  billableHrs: number;
  nonBillableHrs: number;
  rate: number;
  rateIsProject: boolean;
  firmBilledRate: number;
  phaseRows: PhaseRow[];
  startDate: string | null;
  endDate: string | null;
  hasOwnerSalary: boolean;
  alignedRate: number;
  onOpenSettings: () => void;
}) {
  const {
    projectFee, isFixedFee, budgetedBillableHrs, actualHrs, billableHrs, nonBillableHrs,
    rate, rateIsProject, firmBilledRate, phaseRows, startDate, endDate,
    hasOwnerSalary, alignedRate, onOpenSettings,
  } = props;

  const hasFee = projectFee > 0;
  const usableRate = rate > 0 ? rate : firmBilledRate;

  // Empty state: no fee at all
  if (!hasFee) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <h3 className="font-display text-xl tracking-tight text-ch">Profitability</h3>
        <p className="mt-4 text-sm text-ch/70">
          Add a project rate to see profitability.{" "}
          <button onClick={onOpenSettings} className="font-medium text-gold hover:text-goldl">
            Go to project settings →
          </button>
        </p>
      </div>
    );
  }

  const impliedValuePerHr = budgetedBillableHrs > 0 ? projectFee / budgetedBillableHrs : 0;
  const hoursRemaining = Math.max(0, budgetedBillableHrs - actualHrs);
  const overHrs = Math.max(0, actualHrs - budgetedBillableHrs);
  const feeConsumed = actualHrs * usableRate;
  const feeRemaining = projectFee - feeConsumed;
  const usedPct = budgetedBillableHrs > 0 ? Math.min(100, (actualHrs / budgetedBillableHrs) * 100) : 0;
  const overPct = budgetedBillableHrs > 0 ? Math.min(100, (overHrs / budgetedBillableHrs) * 100) : 0;
  const isOver = actualHrs > budgetedBillableHrs && budgetedBillableHrs > 0;

  // Projection (Section 3): only when ≥20% of budget logged.
  const showProjection = budgetedBillableHrs > 0 && actualHrs / budgetedBillableHrs >= 0.2;
  let projectedHrs = 0;
  if (showProjection) {
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const today = Date.now();
      const total = Math.max(1, end - start);
      const elapsed = Math.max(1, Math.min(total, today - start));
      const elapsedPct = elapsed / total;
      for (const p of phaseRows) {
        if (p.ac >= p.sc && p.sc > 0) {
          projectedHrs += p.ac;
        } else if (p.sc > 0 && elapsedPct > 0) {
          const pace = p.ac / elapsedPct;
          projectedHrs += Math.max(p.sc, Math.min(p.ac + (p.sc - p.ac) / Math.max(elapsedPct, 0.01), pace));
        } else {
          projectedHrs += Math.max(p.sc, p.ac);
        }
      }
    } else {
      // No project dates → assume linear pace based on hours-used fraction of budget.
      const usedFrac = actualHrs / budgetedBillableHrs;
      projectedHrs = usedFrac > 0 ? Math.max(actualHrs, actualHrs / Math.min(0.99, usedFrac)) : actualHrs;
    }
  }
  const projectedFeeConsumed = projectedHrs * usableRate;
  const projectedMargin = projectFee - projectedFeeConsumed;
  const projMarginPct = projectFee > 0 ? projectedMargin / projectFee : 0;
  const projMarginTone: "success" | "danger" | "gold" =
    projectedMargin <= 0 ? "danger" : projMarginPct < 0.1 ? "gold" : "success";

  // Bottom line
  const timeCost = actualHrs * usableRate;
  const marginToDate = projectFee - timeCost;
  const marginPct = projectFee > 0 ? (marginToDate / projectFee) * 100 : 0;
  const nonBillableAbsorbed = nonBillableHrs * usableRate;
  const marginTone: "success" | "danger" = marginToDate < 0 ? "danger" : "success";

  const rateLabel = rateIsProject
    ? `Calculated at ${fmtUsd(usableRate)}/hr (your project rate)`
    : `Calculated at ${fmtUsd(usableRate)}/hr (your billed rate — add a project rate for precision)`;

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h3 className="font-display text-xl tracking-tight text-ch">Profitability</h3>
      <p className="mt-1 text-xs text-ch/50 italic">Is the fee enough for the time this is taking?</p>

      {/* SECTION 1 — THE FEE */}
      <SummarySection label="What this project earns">
        <ProfitRow
          label="Project fee"
          value={fmtUsd(projectFee)}
          bold
          tip="The total this project is worth at the rate and scope agreed with your client. This is the ceiling — the most this project can ever earn at full efficiency."
        />
        <ProfitRow
          label="Billable hours budgeted"
          value={formatHours(budgetedBillableHrs)}
          tip="The billable hours scoped across all phases. This is how long the project was designed to take."
        />
        <ProfitRow
          label="Implied value per hour"
          value={`${fmtUsd(impliedValuePerHr)}/hr`}
          tip="Project fee divided by budgeted hours. This is what each hour of your time is worth on this project. If you spend more hours than budgeted, the value per hour you actually earned drops."
        />
      </SummarySection>

      {/* SECTION 2 — THE TIME PICTURE */}
      <SummarySection label="How the time is tracking">
        <ProfitRow label="Hours budgeted" value={formatHours(budgetedBillableHrs)} tip="The billable hours scoped across all phases." />
        <ProfitRow
          label="Hours used so far"
          value={formatHours(actualHrs)}
          accent={isOver ? "danger" : undefined}
          tip="Total time logged on this project, billable and non-billable. Every hour comes out of your fee bucket."
        />
        <ProfitRow
          label="Hours remaining"
          value={isOver ? `−${formatHours(overHrs)}` : formatHours(hoursRemaining)}
          accent={isOver ? "danger" : undefined}
          tip="Budgeted hours minus hours used. When this hits zero, every additional hour erodes margin directly."
        />
      </SummarySection>

      {/* Bucket bar */}
      <div className="mt-3">
        <div className="relative h-3 w-full overflow-hidden rounded-full border border-border bg-cream">
          <div
            className={cn("h-full transition-all", isOver ? "bg-terra" : "bg-gold")}
            style={{ width: `${usedPct}%` }}
          />
          {isOver && (
            <div
              className="absolute top-0 right-0 h-full bg-terra/60 transition-all"
              style={{ width: `${overPct}%` }}
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ch/50">
          <span>{formatHours(actualHrs)} used</span>
          <span>{formatHours(budgetedBillableHrs)} budget</span>
        </div>
      </div>

      <SummarySection label="">
        <ProfitRow
          label="Fee consumed by time so far"
          value={fmtUsd(feeConsumed)}
          tip="Hours logged so far multiplied by your project rate. This is how much of your project fee has been used up in time. When this equals your project fee, the project stops being profitable."
        />
        <ProfitRow
          label="Fee remaining"
          value={fmtUsd(feeRemaining)}
          bold
          accent={feeRemaining < 0 ? "danger" : "success"}
          tip="Project fee minus the cost of time logged so far. This is your remaining margin if no more hours are spent. Every additional hour reduces this."
        />
      </SummarySection>
      <p className="mt-2 text-xs italic text-ch/50">{rateLabel}</p>

      {/* SECTION 3 — IF NOTHING CHANGES */}
      {showProjection && (
        <SummarySection label="At your current pace">
          <ProfitRow
            label="Projected total hours"
            value={formatHours(projectedHrs)}
            tip="Based on your current pace across phases, this is the estimated final hour count. This is a projection — it updates as more time is logged."
          />
          <ProfitRow label="Projected fee consumed" value={fmtUsd(projectedFeeConsumed)} tip="Projected total hours multiplied by your project rate." />
          <ProfitRow
            label="Projected margin"
            value={fmtUsd(projectedMargin)}
            bold
            accent={projMarginTone === "success" ? "success" : projMarginTone === "danger" ? "danger" : "gold"}
            tip="Project fee minus projected fee consumed. What you'll keep if the project finishes at this pace."
          />
        </SummarySection>
      )}

      {/* SECTION 4 — THE BOTTOM LINE */}
      <SummarySection label="The bottom line">
        <ProfitRow label="Project fee" value={fmtUsd(projectFee)} tip="Total fee for this project." />
        <ProfitRow label="Time cost to date" value={fmtUsd(timeCost)} tip="Hours logged so far multiplied by your project rate — the share of the fee already consumed." />
        <ProfitRow
          label="Margin to date"
          value={fmtUsd(marginToDate)}
          bold
          accent={marginTone}
          tip="Project fee minus time cost to date. What's left of the fee if no more hours are spent."
        />
        <ProfitRow label="Margin %" value={fmtPct(marginPct)} tip="Margin to date as a percent of the project fee." />
        <ProfitRow
          label="Non-billable time absorbed"
          value={fmtUsd(nonBillableAbsorbed)}
          accent={nonBillableAbsorbed > 0 ? "danger" : undefined}
          tip="Time you logged as non-billable on this project. This time has a cost — it consumed hours that could have been spent on billable work. It's a choice, not an error. Showing it here makes it visible."
        />
      </SummarySection>

      {!hasOwnerSalary && (
        <p className="mt-3 text-xs text-ch/60">
          No owner salary set. Time costs are calculated at your aligned rate ({fmtUsd(alignedRate)}/hr) — the rate your cost structure requires. This reflects the earning capacity consumed, not cash paid out.{" "}
          <a href="/dashboard/rate" className="font-medium text-gold hover:text-goldl">Set owner compensation →</a>
        </p>
      )}

      {isFixedFee && (
        <p className="mt-3 text-xs text-ch/40">Fixed-fee project. Fee is the agreed total regardless of hours logged.</p>
      )}
    </div>
  );
}

function SummarySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-border pt-4 first:mt-4 first:border-0 first:pt-0">
      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ch/40">{label}</p>
      <table className="w-full text-sm">
        <tbody className="[&_td]:py-1.5">{children}</tbody>
      </table>
    </div>
  );
}

function ProfitRow({ label, value, bold, accent, tip }: {
  label: string; value: string; bold?: boolean;
  accent?: "success" | "danger" | "gold"; tip: string;
}) {
  return (
    <tr>
      <td className="text-ch/70">
        <span className="inline-flex items-center gap-1">
          {label}
          <HoverCard openDelay={120}>
            <HoverCardTrigger asChild>
              <button type="button" className="text-ch/40 hover:text-ch" aria-label={`About ${label}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80 text-xs leading-relaxed text-ch/80">{tip}</HoverCardContent>
          </HoverCard>
        </span>
      </td>
      <td className={cn(
        "text-right tabular-nums font-display text-lg",
        bold && "text-xl",
        accent === "danger" && "text-terra",
        accent === "success" && "text-success",
        accent === "gold" && "text-gold",
        !accent && "text-ch",
      )}>{value}</td>
    </tr>
  );
}

// =============================================================================
// HOURS SUMMARY — stacked bar
// =============================================================================

function HoursSummary({ scopedHrs, billableHrs, nonBillableHrs }: {
  scopedHrs: number; billableHrs: number; nonBillableHrs: number;
}) {
  const total = billableHrs + nonBillableHrs;
  const remaining = Math.max(0, scopedHrs - total);
  const overflow = Math.max(0, total - scopedHrs);

  // Bar is bounded to 100% of container. Overflow is shown as a separate
  // labeled callout above the bar — never as a segment that extends past
  // the container edge.
  const denom = scopedHrs > 0 ? scopedHrs : Math.max(1, total);
  const rawBillPct = Math.min(100, (billableHrs / denom) * 100);
  const rawNonBillPct = Math.min(100 - rawBillPct, (nonBillableHrs / denom) * 100);
  // When over scope, push billable+non-bill to fill the full 100%, no remainder.
  const overScope = total > scopedHrs;
  const billPct = overScope && total > 0 ? (billableHrs / total) * 100 : rawBillPct;
  const nonBillPct = overScope && total > 0 ? (nonBillableHrs / total) * 100 : rawNonBillPct;
  const remainPct = Math.max(0, 100 - billPct - nonBillPct);

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl tracking-tight text-ch">Hours</h3>
        {overflow > 0 && (
          <span className="text-xs uppercase tracking-[0.15em] text-terra">+{formatHours(overflow)} over budget</span>
        )}
      </div>

      <div className="relative mt-5 w-full overflow-hidden">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-creamd">
          {billPct > 0 && <div className="h-full bg-success" style={{ width: `${billPct}%` }} />}
          {nonBillPct > 0 && <div className="h-full bg-terra/70" style={{ width: `${nonBillPct}%` }} />}
          {remainPct > 0 && <div className="h-full" style={{ width: `${remainPct}%` }} />}
        </div>
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        <LegendRow swatch="bg-success" label="Billable logged" value={formatHours(billableHrs)} />
        <LegendRow swatch="bg-terra/70" label="Non-billable logged" value={formatHours(nonBillableHrs)} />
        <LegendRow swatch="bg-creamd border border-border" label="Remaining budget" value={formatHours(remaining)} />
        <div className="border-t border-border pt-2 mt-2 flex justify-between font-medium text-ch">
          <span>Total scoped</span>
          <span className="tabular-nums">{formatHours(scopedHrs)}</span>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ch/70">
        <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", swatch)} />
        {label}
      </span>
      <span className="tabular-nums text-ch">{value}</span>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ch/50">{label}</div>
      <div className="mt-1 font-display text-2xl text-ch">{value}</div>
    </div>
  );
}

// =============================================================================
// PHASE CARD (collapsible)
// =============================================================================

function PhaseCard({
  phase, steps, entries, team, isPrincipal, isAdmin,
  onEditHrs, onEditBillable, onDelete,
}: {
  phase: PhaseRow;
  steps: { id: string; description: string; estimated_hrs: number; sort_order: number; project_phase_id: string }[];
  entries: { id: string; date: string; user_id: string; hrs: number; billable: boolean; notes: string | null }[];
  team: { id: string; name: string | null; email: string }[];
  isPrincipal: boolean;
  isAdmin: boolean;
  onEditHrs: (hrs: number) => void;
  onEditBillable: (b: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editHrs, setEditHrs] = useState(false);
  const [hrsDraft, setHrsDraft] = useState(String(phase.expected_hrs));

  const status = !phase.billable
    ? { label: "Non-bill", tone: "muted" as const }
    : phase.pct > 100
      ? { label: "Over estimate", tone: "muted" as const }
      : phase.pct >= 80
        ? { label: "Heads up", tone: "gold" as const }
        : { label: "On track", tone: "success" as const };

  const variance = phase.variance;
  const overUnderText = !phase.billable
    ? "Absorbed cost"
    : variance > 0
      ? `+${fmtUsd(variance * 0)}`  // dollar amount uses project rate at call site
      : `${fmtUsd(Math.abs(variance) * 0)} remaining`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border bg-white">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-4 p-4 text-left hover:bg-creamd/30">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ch">{phase.name}</span>
                {phase.sop_phase_id && (
                  <span className="rounded-full border border-border bg-creamd/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] text-ch/60">
                    In SOP library
                  </span>
                )}
                <StatusBadge tone={status.tone} label={status.label} />
              </div>
              {/* mini stacked progress bar */}
              <PhaseMiniBar phase={phase} />
            </div>
            <div className="hidden text-right text-xs text-ch/60 md:block">
              <div className="tabular-nums text-ch">{formatHours(phase.ac)} / {formatHours(phase.sc)}</div>
              <div className="mt-0.5 text-[11px]">
                {phase.billable
                  ? variance > 0
                    ? <span className="text-ch/60">+{formatHours(variance)} over estimate</span>
                    : <span className="text-success/80">{formatHours(Math.abs(variance))} remaining</span>
                  : <span className="text-ch/50">Non-billable</span>}
              </div>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-ch/40 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border p-5">
            {/* Process steps */}
            {steps.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Process steps</p>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-creamd/30">
                  {steps.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-ch/80">{s.description}</span>
                      <span className="text-xs text-ch/50 tabular-nums">{formatHours(Number(s.estimated_hrs))}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-ch">
                    <span>Phase total</span>
                    <span className="tabular-nums">{formatHours(phase.sc)}</span>
                  </li>
                </ul>
              </div>
            ) : (
              <p className="text-sm text-ch/50">No process steps recorded for this phase.</p>
            )}

            {/* Financial controls */}
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] text-ch/50">
                  Budgeted hours
                  {!isPrincipal && (
                    <HoverCard openDelay={120}>
                      <HoverCardTrigger asChild>
                        <Lock className="h-3 w-3 text-ch/40" />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-72 text-xs">Financial parameters can only be edited by the firm principal.</HoverCardContent>
                    </HoverCard>
                  )}
                </label>
                {editHrs && isPrincipal ? (
                  <div className="flex gap-2">
                    <Input type="number" min={0} step="any" value={hrsDraft} onChange={(e) => setHrsDraft(e.target.value)} />
                    <Button
                      size="sm"
                      onClick={() => {
                        const v = Number(hrsDraft);
                        if (!Number.isFinite(v) || v < 0) return;
                        onEditHrs(v);
                        setEditHrs(false);
                      }}
                    >Update</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setHrsDraft(String(phase.expected_hrs)); setEditHrs(false); }}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-ch">{formatHours(phase.sc)}</span>
                    {isPrincipal && (
                      <Button size="sm" variant="outline" onClick={() => setEditHrs(true)}>Edit</Button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] text-ch/50">
                  Billable
                  {!isPrincipal && (
                    <HoverCard openDelay={120}>
                      <HoverCardTrigger asChild>
                        <Lock className="h-3 w-3 text-ch/40" />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-72 text-xs">Financial parameters can only be edited by the firm principal.</HoverCardContent>
                    </HoverCard>
                  )}
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={phase.billable}
                    disabled={!isPrincipal}
                    onChange={(e) => onEditBillable(e.target.checked)}
                    className="accent-gold"
                  />
                  <span className="text-ch/80">{phase.billable ? "Billable phase" : "Non-billable phase"}</span>
                </label>
              </div>
            </div>

            {/* Time entries for this phase */}
            {entries.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Time logged on this phase</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {entries.slice(0, 8).map((e) => {
                    const who = team.find((m) => m.id === e.user_id);
                    return (
                      <li key={e.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
                        <span className="text-ch/70">{e.date} · {who?.name || who?.email || "—"}</span>
                        <span className={cn("tabular-nums", e.billable ? "text-ch" : "text-terra/80")}>
                          {formatHours(Number(e.hrs))}{!e.billable && " · non-bill"}
                        </span>
                      </li>
                    );
                  })}
                  {entries.length > 8 && (
                    <li className="text-xs text-ch/50">+{entries.length - 8} more in Time Log</li>
                  )}
                </ul>
              </div>
            )}

            {phase.billable && phase.variance > 0 && (
              <p className="mt-4 text-xs text-ch/60">
                This phase used {formatHours(phase.variance)} more than its estimate.
              </p>
            )}

            <div className="mt-5 flex items-center justify-between">
              <a
                href="/time-calendar"
                className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white hover:bg-goldl"
              >
                Log time
              </a>
              {isAdmin && (
                <button onClick={onDelete} className="text-xs text-ch/40 hover:text-terra">
                  <Trash2 className="mr-1 inline h-3 w-3" /> Delete phase
                </button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function PhaseMiniBar({ phase }: { phase: PhaseRow }) {
  const denom = phase.sc > 0 ? phase.sc : Math.max(1, phase.ac);
  const total = phase.billableActual + phase.nonBillActual;
  const overScope = total > phase.sc;
  const rawBill = Math.min(100, (phase.billableActual / denom) * 100);
  const rawNon = Math.min(100 - rawBill, (phase.nonBillActual / denom) * 100);
  const billPct = overScope && total > 0 ? (phase.billableActual / total) * 100 : rawBill;
  const nonBillPct = overScope && total > 0 ? (phase.nonBillActual / total) * 100 : rawNon;
  const remainPct = Math.max(0, 100 - billPct - nonBillPct);
  return (
    <div className="relative mt-2 w-full max-w-md overflow-hidden">
      <div className="flex h-1 w-full overflow-hidden rounded-full bg-creamd">
        {billPct > 0 && <div className="h-full bg-success" style={{ width: `${billPct}%` }} />}
        {nonBillPct > 0 && <div className="h-full bg-terra/70" style={{ width: `${nonBillPct}%` }} />}
        {remainPct > 0 && <div className="h-full" style={{ width: `${remainPct}%` }} />}
      </div>
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: "success" | "gold" | "terra" | "muted"; label: string }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[10px] tracking-[0.05em]",
      tone === "success" && "bg-success/10 text-success",
      tone === "gold" && "bg-goldp text-gold",
      tone === "terra" && "bg-terra/10 text-terra",
      tone === "muted" && "bg-creamd text-ch/60",
    )}>{label}</span>
  );
}
