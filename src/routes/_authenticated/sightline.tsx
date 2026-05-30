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
import { fmtUsd, fmtPct, formatHours } from "@/lib/finance";
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

type Status = "active" | "pipeline" | "completed" | "on_hold";

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
  const [draft, setDraft] = useState({ name: "", client_name: "", scoped_rate: "" });

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
        },
      });
      toast.success("Project created");
      setDraft({ name: "", client_name: "", scoped_rate: "" });
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
        <form onSubmit={submitCreate} className="mb-6 grid grid-cols-12 items-end gap-3 rounded-lg border border-border bg-white p-4">
          <div className="col-span-5">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Project name</label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus required />
          </div>
          <div className="col-span-4">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Client</label>
            <Input value={draft.client_name} onChange={(e) => setDraft({ ...draft, client_name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-ch/50">Scoped rate $/hr</label>
            <Input type="number" min={0} step="any" value={draft.scoped_rate} onChange={(e) => setDraft({ ...draft, scoped_rate: e.target.value })} placeholder={billedRate ? String(billedRate) : "—"} />
          </div>
          <Button type="submit" className="col-span-1 bg-ch text-cream hover:bg-ch/90">Create</Button>
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

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getDetail = useServerFn(getProjectDetail);
  const statusFn = useServerFn(updateProjectStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["sightline-detail", id],
    queryFn: () => getDetail({ data: { id } }),
  });
  // Live-refresh phase actuals (and the entries that drive them) when time is logged.
  useRealtimeInvalidate(
    `sightline-detail-${id}`,
    [
      { table: "project_phases", filter: `project_id=eq.${id}` },
      { table: "time_entries", filter: `project_id=eq.${id}` },
    ],
    [["sightline-detail", id]],
  );
  const statusMut = useMutation({
    mutationFn: (status: Status) => statusFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sightline-detail", id] });
      qc.invalidateQueries({ queryKey: ["sightline-list"] });
    },
  });

  const upsertPhaseFn = useServerFn(upsertProjectPhase);
  const deletePhaseFn = useServerFn(deleteProjectPhase);
  const phaseMut = useMutation({
    mutationFn: (input: { id?: string; name: string; expected_hrs: number; billable: boolean }) =>
      upsertPhaseFn({ data: { project_id: id, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sightline-detail", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const deletePhaseMut = useMutation({
    mutationFn: (phaseId: string) => deletePhaseFn({ data: { id: phaseId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sightline-detail", id] }),
  });
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", expected_hrs: "", billable: true });
  const [addingPhase, setAddingPhase] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: "", expected_hrs: "", billable: true });

  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-12">
        <button onClick={onBack} className="text-sm text-ch/60 hover:text-ch">← Back</button>
        <p className="mt-8 text-ch/50">Loading project…</p>
      </div>
    );
  }

  const billedRate = Number(data.config?.rate_billed) || 0;
  // Avg cost rate across team for cost-floor estimation
  const teamCostRates = data.team.map((m) => Number(m.cost_rate) || 0).filter((n) => n > 0);
  const avgCostRate = teamCostRates.length ? teamCostRates.reduce((s, n) => s + n, 0) / teamCostRates.length : billedRate * 0.6;

  const scopedHrs = data.phases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
  const actualHrs = data.phases.reduce((s, p) => s + Number(p.actual_hrs || 0), 0);
  const billableHrs = data.entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
  const nonBillableHrs = data.entries.reduce((s, e) => s + Number(e.hrs || 0), 0) - billableHrs;
  const scopedRevenue = scopedHrs * billedRate;
  const actualRevenue = billableHrs * billedRate;
  const scopedCost = scopedHrs * avgCostRate;
  const actualCost = actualHrs * avgCostRate;
  const scopedMargin = scopedRevenue - scopedCost;
  const actualMargin = actualRevenue - actualCost;
  const nonBillableCostAbsorbed = nonBillableHrs * avgCostRate;

  const phaseRows = data.phases.map((p) => {
    const sc = Number(p.expected_hrs || 0);
    const ac = Number(p.actual_hrs || 0);
    const variance = ac - sc;
    const dollars = variance * billedRate;
    const pct = sc > 0 ? (ac / sc) * 100 : ac > 0 ? 100 : 0;
    return { ...p, sc, ac, variance, dollars, pct };
  });

  const unscopedTotal = phaseRows.filter((p) => p.variance > 0).reduce((s, p) => s + p.variance, 0);
  const overPhases = phaseRows.filter((p) => p.variance > 0);

  const warnings: { kind: "over" | "near" | "nonbill"; text: string }[] = [];
  for (const p of phaseRows) {
    if (p.variance > 0) warnings.push({ kind: "over", text: `${p.name} is over scope by ${p.variance.toFixed(1)}h` });
  }
  if (scopedHrs > 0 && actualHrs / scopedHrs >= 0.8 && actualHrs / scopedHrs < 1) {
    warnings.push({ kind: "near", text: `Total hours at ${((actualHrs / scopedHrs) * 100).toFixed(0)}% of scope` });
  }
  const totalLogged = billableHrs + nonBillableHrs;
  if (totalLogged > 0 && nonBillableHrs / totalLogged > 0.15) {
    warnings.push({ kind: "nonbill", text: `Non-billable hours are ${((nonBillableHrs / totalLogged) * 100).toFixed(0)}% of project time` });
  }

  const filteredEntries = data.entries.filter((e) => {
    if (memberFilter !== "all" && e.user_id !== memberFilter) return false;
    if (phaseFilter !== "all" && e.project_phase_id !== phaseFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ch/60 hover:text-ch">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Project profitability</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ch">{data.project.name}</h1>
          <p className="mt-1 text-ch/60">
            {data.project.client_name ?? "No client"} ·{" "}
            {data.template?.name ? `Template: ${data.template.name}` : "No template attached"}
          </p>
        </div>
        <Select value={data.project.status} onValueChange={(v) => statusMut.mutate(v as Status)}>
          <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pipeline">Pipeline</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {warnings.length > 0 && (
        <div className="mt-6 rounded-lg border border-terra/30 bg-terra/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-terra">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="font-display text-lg">Warnings</h3>
          </div>
          <ul className="space-y-1 text-sm text-ch/80">
            {warnings.map((w, i) => <li key={i}>· {w.text}</li>)}
          </ul>
        </div>
      )}

      {unscopedTotal > 0 && billedRate > 0 && (
        <div className="mt-6 rounded-lg border border-gold/40 bg-goldp/40 p-5">
          <div className="flex items-center gap-2 text-gold">
            <TrendingDown className="h-4 w-4" />
            <h3 className="font-display text-lg text-ch">Scope creep</h3>
          </div>
          <p className="mt-2 text-ch/80">
            You've spent <span className="font-display text-xl text-ch">{formatHours(unscopedTotal)} unscoped</span>
            {" "}across {overPhases.length} phase{overPhases.length !== 1 && "s"} — that's{" "}
            <span className="font-display text-xl text-terra">{fmtUsd(unscopedTotal * billedRate)}</span>
            {" "}at your billed rate.
          </p>
          {overPhases.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-ch/70">
              {overPhases.map((p) => (
                <li key={p.id}>· {p.name}: +{formatHours(p.variance)} ({fmtUsd(p.variance * billedRate)})</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl tracking-tight text-ch">Phase breakdown</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-creamd/60 text-[10px] uppercase tracking-[0.16em] text-ch/50">
              <tr>
                <th className="px-4 py-3 text-left">Phase</th>
                <th className="px-3 py-3 text-right">Scoped</th>
                <th className="px-3 py-3 text-right">Actual</th>
                <th className="px-3 py-3 text-right">Variance</th>
                <th className="px-3 py-3 text-right">Δ $</th>
                <th className="px-3 py-3 text-right">% used</th>
                <th className="px-4 py-3 text-right">Status</th>
                <th className="px-3 py-3 text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {phaseRows.map((p) => {
                const h = healthColor(p.pct);
                const isEditing = editingPhase === p.id;
                if (isEditing) {
                  return (
                    <tr key={p.id} className="border-t border-border bg-creamd/40">
                      <td className="px-4 py-2"><Input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                      <td className="px-3 py-2"><Input type="number" min={0} step="any" value={editDraft.expected_hrs} onChange={(e) => setEditDraft({ ...editDraft, expected_hrs: e.target.value })} className="text-right" /></td>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs text-ch/50">
                        <label className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={editDraft.billable} onChange={(e) => setEditDraft({ ...editDraft, billable: e.target.checked })} className="accent-gold" />
                          Billable
                        </label>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => { phaseMut.mutate({ id: p.id, name: editDraft.name, expected_hrs: Number(editDraft.expected_hrs) || 0, billable: editDraft.billable }); setEditingPhase(null); }} className="text-success hover:opacity-70"><Check className="h-4 w-4" /></button>
                          <button onClick={() => setEditingPhase(null)} className="text-ch/40 hover:text-ch"><X className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-ch">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {!p.billable && (
                          <span className="rounded-full bg-terra/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] text-terra">Non-bill</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatHours(p.sc)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatHours(p.ac)}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", p.variance > 0 ? "text-terra" : p.variance < 0 ? "text-success" : "")}>
                      {p.variance >= 0 ? "+" : ""}{formatHours(Math.abs(p.variance))}
                    </td>
                    {!p.billable ? (
                      <td className="px-3 py-3 text-right tabular-nums text-terra">
                        <div>{fmtUsd(-(p.ac * avgCostRate))}</div>
                        <div className="text-[10px] font-normal normal-case tracking-normal text-ch/50">Non-billable — absorbed cost</div>
                      </td>
                    ) : (
                      <td className={cn("px-3 py-3 text-right tabular-nums", p.dollars > 0 ? "text-terra" : "text-ch/60")}>
                        {billedRate > 0 ? fmtUsd(p.dollars) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right tabular-nums">{p.pct.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]", h.text, "border border-current/20")}>
                        {h.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button onClick={() => { setEditingPhase(p.id); setEditDraft({ name: p.name, expected_hrs: String(p.sc), billable: p.billable }); }} className="text-ch/40 hover:text-ch"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { if (confirm(`Delete phase "${p.name}"?`)) deletePhaseMut.mutate(p.id); }} className="text-ch/40 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {phaseRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ch/50">No phases on this project.</td></tr>
              )}
              {addingPhase && (
                <tr className="border-t border-border bg-creamd/40">
                  <td className="px-4 py-2"><Input placeholder="Phase name" value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} autoFocus /></td>
                  <td className="px-3 py-2"><Input type="number" min={0} step="any" placeholder="hrs" value={addDraft.expected_hrs} onChange={(e) => setAddDraft({ ...addDraft, expected_hrs: e.target.value })} className="text-right" /></td>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-ch/50">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={addDraft.billable} onChange={(e) => setAddDraft({ ...addDraft, billable: e.target.checked })} className="accent-gold" />
                      Billable
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => { if (!addDraft.name.trim()) return; phaseMut.mutate({ name: addDraft.name.trim(), expected_hrs: Number(addDraft.expected_hrs) || 0, billable: addDraft.billable }); setAddDraft({ name: "", expected_hrs: "", billable: true }); setAddingPhase(false); }} className="text-success hover:opacity-70"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setAddingPhase(false)} className="text-ch/40 hover:text-ch"><X className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!addingPhase && (
          <button onClick={() => setAddingPhase(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm text-gold hover:text-goldl">
            <Plus className="h-4 w-4" /> Add phase
          </button>
        )}
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="font-display text-xl tracking-tight text-ch">Profitability summary</h3>
          <table className="mt-4 w-full text-sm">
            <tbody className="[&_td]:py-1.5">
              <SummaryRow label="Scoped revenue" value={fmtUsd(scopedRevenue)} />
              <SummaryRow label="Actual revenue" value={fmtUsd(actualRevenue)} />
              <SummaryRow label="Scoped cost" value={fmtUsd(scopedCost)} />
              <SummaryRow label="Actual cost" value={fmtUsd(actualCost)} />
              <tr><td colSpan={2}><div className="my-2 border-t border-border" /></td></tr>
              <SummaryRow label="Scoped margin" value={fmtUsd(scopedMargin)} bold />
              <SummaryRow label="Actual margin" value={fmtUsd(actualMargin)} bold accent={actualMargin < 0 ? "danger" : "success"} />
              <SummaryRow
                label="Margin variance"
                value={`${fmtUsd(actualMargin - scopedMargin)} (${fmtPct(scopedMargin !== 0 ? ((actualMargin - scopedMargin) / Math.abs(scopedMargin)) * 100 : 0)})`}
                accent={actualMargin < scopedMargin ? "danger" : "success"}
              />
              <tr>
                <td className="text-ch/60">
                  <span className="inline-flex items-center gap-1">
                    Non-billable cost absorbed
                    <HoverCard openDelay={120}>
                      <HoverCardTrigger asChild>
                        <button type="button" className="text-ch/40 hover:text-ch" aria-label="About non-billable cost absorbed">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 text-xs leading-relaxed text-ch/80">
                        This is the cost of time you logged as non-billable on this project. It is already reflected in your actual margin above. Surfaced here so you can see what you chose to absorb versus what you billed.
                      </HoverCardContent>
                    </HoverCard>
                  </span>
                </td>
                <td className="text-right tabular-nums text-terra">{fmtUsd(nonBillableCostAbsorbed)}</td>
              </tr>
            </tbody>
          </table>
          {billedRate === 0 && (
            <p className="mt-3 text-xs text-ch/50">Set your billed rate in Rate & Cost Architecture to see revenue figures.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="font-display text-xl tracking-tight text-ch">Hours summary</h3>
          <table className="mt-4 w-full text-sm">
            <tbody className="[&_td]:py-1.5">
              <SummaryRow label="Scoped hours" value={formatHours(scopedHrs)} />
              <SummaryRow label="Actual hours" value={formatHours(actualHrs)} />
              <SummaryRow label="Billable logged" value={formatHours(billableHrs)} />
              <SummaryRow label="Non-billable logged" value={formatHours(nonBillableHrs)} />
              <SummaryRow
                label="% consumed"
                value={scopedHrs > 0 ? `${((actualHrs / scopedHrs) * 100).toFixed(0)}%` : "—"}
                accent={scopedHrs > 0 && actualHrs > scopedHrs ? "danger" : undefined}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl tracking-tight text-ch">Time entries</h2>
          <div className="ml-auto flex gap-2">
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {data.team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Phase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                {data.phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-creamd/60 text-[10px] uppercase tracking-[0.16em] text-ch/50">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Member</th>
                <th className="px-3 py-3 text-left">Phase</th>
                <th className="px-3 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.slice(0, 100).map((e) => {
                const member = data.team.find((m) => m.id === e.user_id);
                const phase = data.phases.find((p) => p.id === e.project_phase_id);
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-2 text-ch/80">{e.date}</td>
                    <td className="px-3 py-2 text-ch/80">{member?.name || member?.email || "—"}</td>
                    <td className="px-3 py-2 text-ch/80">{phase?.name || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(Number(e.hrs))}</td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]",
                        e.billable ? "bg-success/10 text-success" : "bg-terra/10 text-terra")}>
                        {e.billable ? "Billable" : "Non-bill"}
                      </span>
                    </td>
                    <td className="px-4 py-2 max-w-xs truncate text-ch/60">{e.notes ?? ""}</td>
                  </tr>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ch/50">No time entries match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: "success" | "danger" }) {
  return (
    <tr>
      <td className="text-ch/60">{label}</td>
      <td className={cn("text-right tabular-nums",
        bold && "font-display text-lg text-ch",
        accent === "danger" && "text-terra",
        accent === "success" && "text-success",
      )}>{value}</td>
    </tr>
  );
}