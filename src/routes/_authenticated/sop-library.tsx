import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Trash2, GripVertical, ArrowLeft, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";
import { TierLocked } from "@/components/shell/TierLocked";
import { getMyContext } from "@/lib/firm.functions";
import {
  getSopLibrary,
  saveSopTemplate,
  deleteSopTemplate,
  attachTemplateToProject,
} from "@/lib/sop.functions";
import { fmtUsd, formatHours } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Risk = "low" | "medium" | "high";
type Step = { id?: string; description: string; estimated_hrs: number; sort_order: number };
type Phase = {
  id?: string;
  name: string;
  expected_hrs: number;
  billable: boolean;
  description?: string | null;
  time_benchmark_notes?: string | null;
  sort_order: number;
  steps: Step[];
};
type TemplateDraft = {
  id?: string;
  name: string;
  category: string;
  department: string;
  description: string;
  tags: string[];
  triggered_by: string;
  done_when: string;
  scope_risk_level: Risk;
  common_failure_modes: string;
  phases: Phase[];
};

const emptyDraft = (): TemplateDraft => ({
  name: "",
  category: "",
  department: "",
  description: "",
  tags: [],
  triggered_by: "",
  done_when: "",
  scope_risk_level: "low",
  common_failure_modes: "",
  phases: [],
});

const RISK_STYLE: Record<Risk, string> = {
  low: "bg-success/10 text-success border-success/30",
  medium: "bg-goldl/15 text-gold border-gold/30",
  high: "bg-terra/10 text-terra border-terra/30",
};

export const Route = createFileRoute("/_authenticated/sop-library")({
  head: () => ({ meta: [{ title: "SOP Library — Sightline" }] }),
  component: SopLibraryPage,
});

function SopLibraryPage() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => ctxFn() });
  const isSuperAdmin = !!ctx?.profile?.is_super_admin;
  const isImpersonating = !!ctx?.profile?.impersonated_firm_id;
  const rawTier = (ctx?.firm?.subscription_tier as "foundation" | "studio" | "practice") ?? "foundation";
  const tier = isSuperAdmin && !isImpersonating ? "practice" : rawTier;

  if (tier !== "practice") {
    return (
      <ModulePage eyebrow="Practice" title="SOP Library" description="Scope templates and phase benchmarks that become the contracts you send.">
        <TierLocked
          tier="practice"
          title="The library that codifies how your studio works"
          blurb="Every project starts from a template. Phases, hours, scope language — all reusable. Stop pricing every project from scratch."
          unlocks={[
            "Build reusable scope templates with phase-level hour benchmarks",
            "See cost / revenue / margin per phase before you quote",
            "Attach a template to a new project in one click",
            "Track scope risk and common failure modes per workflow",
          ]}
        />
      </ModulePage>
    );
  }
  return <Library />;
}

function Library() {
  const qc = useQueryClient();
  const getLib = useServerFn(getSopLibrary);
  const saveFn = useServerFn(saveSopTemplate);
  const delFn = useServerFn(deleteSopTemplate);
  const attachFn = useServerFn(attachTemplateToProject);

  const { data, isLoading } = useQuery({ queryKey: ["sop-library"], queryFn: () => getLib() });
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | Risk>("all");
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const [attachFor, setAttachFor] = useState<{ id: string; name: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: (d: TemplateDraft) =>
      saveFn({
        data: {
          id: d.id,
          name: d.name,
          category: d.category || null,
          department: d.department || null,
          description: d.description || null,
          tags: d.tags.length ? d.tags : null,
          triggered_by: d.triggered_by || null,
          done_when: d.done_when || null,
          scope_risk_level: d.scope_risk_level,
          common_failure_modes: d.common_failure_modes || null,
          phases: d.phases.map((p, i) => ({
            id: p.id, name: p.name, expected_hrs: Number(p.expected_hrs) || 0,
            billable: p.billable, description: p.description, time_benchmark_notes: p.time_benchmark_notes,
            sort_order: i,
            steps: p.steps.map((s, j) => ({ id: s.id, description: s.description, sort_order: j })),
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      setEditing(null);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sop-library"] }),
  });

  const attachMut = useMutation({
    mutationFn: (v: { template_id: string; project_id: string }) =>
      attachFn({ data: v }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      qc.invalidateQueries({ queryKey: ["sightline-list"] });
      qc.invalidateQueries({ queryKey: ["sightline-detail", vars.project_id] });
      setAttachFor(null);
      toast.success("Template attached to project");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to attach");
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.templates.filter((t) => {
      if (riskFilter !== "all" && t.scope_risk_level !== riskFilter) return false;
      if (!q) return true;
      return [t.name, t.category, t.department].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [data, search, riskFilter]);

  if (editing) {
    return (
      <TemplateEditor
        draft={editing}
        onChange={setEditing}
        onSave={() => saveMut.mutate(editing)}
        onCancel={() => setEditing(null)}
        saving={saveMut.isPending}
        config={data?.config ?? null}
      />
    );
  }

  return (
    <ModulePage
      eyebrow="Practice"
      title="SOP Library"
      description="The way your studio works — codified, priced, and reusable."
      actions={
        <Button onClick={() => setEditing(emptyDraft())} className="bg-gold hover:bg-goldl">
          <Plus className="mr-2 h-4 w-4" /> New template
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ch/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9 bg-white"
          />
        </div>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}>
          <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk levels</SelectItem>
            <SelectItem value="low">Low risk</SelectItem>
            <SelectItem value="medium">Medium risk</SelectItem>
            <SelectItem value="high">High risk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-ch/50">Loading library…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white/60 p-12 text-center">
          <p className="font-display text-2xl italic text-ch/60">No templates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ch/60">
            Templates capture how a workflow actually runs — phases, hours, scope language.
          </p>
          <Button onClick={() => setEditing(emptyDraft())} className="mt-4 bg-gold hover:bg-goldl">
            Create your first template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((tpl) => {
            const phases = data!.phases.filter((p) => p.template_id === tpl.id);
            const scoped = phases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
            const lastUsed = data!.lastUsed[tpl.id];
            return (
              <div
                key={tpl.id}
                className="group flex flex-col rounded-lg border border-border bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl tracking-tight text-ch">{tpl.name}</h3>
                    <p className="mt-0.5 text-xs uppercase tracking-[0.16em] text-ch/50">
                      {tpl.category || "Uncategorized"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em]",
                      RISK_STYLE[(tpl.scope_risk_level ?? "low") as Risk],
                    )}
                  >
                    {tpl.scope_risk_level ?? "low"}
                  </span>
                </div>
                {tpl.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-ch/70">{tpl.description}</p>
                )}
                <div className="mt-4 flex items-baseline gap-6 border-t border-border pt-4">
                  <div>
                    <div className="font-display text-2xl text-ch">{phases.length}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Phases</div>
                  </div>
                  <div>
                    <div className="font-display text-2xl text-ch">{scoped.toFixed(0)}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-ch/50">Scoped hrs</div>
                  </div>
                  <div className="ml-auto text-right text-[11px] text-ch/50">
                    {lastUsed ? `Last used ${new Date(lastUsed).toLocaleDateString()}` : "Never used"}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-border"
                    onClick={() => {
                      const phs = data!.phases
                        .filter((p) => p.template_id === tpl.id)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((p): Phase => ({
                          id: p.id, name: p.name, expected_hrs: Number(p.expected_hrs),
                          billable: p.billable, description: p.description,
                          time_benchmark_notes: p.time_benchmark_notes, sort_order: p.sort_order,
                          steps: data!.steps
                            .filter((s) => s.phase_id === p.id)
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((s) => ({
                              id: s.id,
                              description: s.description,
                              estimated_hrs: Number((s as { estimated_hrs?: number }).estimated_hrs) || 0,
                              sort_order: s.sort_order,
                            })),
                        }));
                      setEditing({
                        id: tpl.id, name: tpl.name, category: tpl.category ?? "",
                        department: tpl.department ?? "", description: tpl.description ?? "",
                        tags: tpl.tags ?? [], triggered_by: tpl.triggered_by ?? "",
                        done_when: tpl.done_when ?? "", scope_risk_level: (tpl.scope_risk_level ?? "low") as Risk,
                        common_failure_modes: tpl.common_failure_modes ?? "", phases: phs,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    className="flex-1 bg-ch text-white hover:bg-ch/85"
                    onClick={() => setAttachFor({ id: tpl.id, name: tpl.name })}
                  >
                    Attach to project
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!attachFor} onOpenChange={(o) => !o && setAttachFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Attach “{attachFor?.name}”</DialogTitle>
          </DialogHeader>
          <AttachForm
            onSubmit={(v) => attachFor && attachMut.mutate({ ...v, template_id: attachFor.id })}
            saving={attachMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {delMut.isPending && <div className="sr-only">Deleting…</div>}
    </ModulePage>
  );

  function AttachForm({ onSubmit, saving }: { onSubmit: (v: { project_name: string; client_name: string }) => void; saving: boolean }) {
    const [name, setName] = useState("");
    const [client, setClient] = useState("");
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit({ project_name: name.trim(), client_name: client.trim() }); }}
        className="space-y-4"
      >
        <div>
          <Label>Project name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} className="mt-1" />
        </div>
        <div>
          <Label>Client (optional)</Label>
          <Input value={client} onChange={(e) => setClient(e.target.value)} maxLength={160} className="mt-1" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving} className="bg-gold hover:bg-goldl">
            {saving ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    );
  }
}

function TemplateEditor({
  draft, onChange, onSave, onCancel, saving, config,
}: {
  draft: TemplateDraft;
  onChange: (d: TemplateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  config: { rate_billed: number | null; comp_draw_annual: number | null } | null;
}) {
  // Derive a per-hour cost from firm_config (simplified): break-even ≈ comp+opex / billable hrs.
  // We use rate_billed if set, else a fallback for phase-level financials.
  const billedRate = Number(config?.rate_billed) || 0;
  // Simple cost proxy: 60% of billed rate as cost-floor approximation
  const costPerHour = billedRate > 0 ? billedRate * 0.6 : 0;

  function setPhases(updater: (phs: Phase[]) => Phase[]) {
    onChange({ ...draft, phases: updater(draft.phases) });
  }

  function addPhase() {
    setPhases((phs) => [
      ...phs,
      { name: "New phase", expected_hrs: 0, billable: true, description: "", time_benchmark_notes: "", sort_order: phs.length, steps: [] },
    ]);
  }

  function movePhase(idx: number, dir: -1 | 1) {
    setPhases((phs) => {
      const next = [...phs];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  const totalScoped = draft.phases.reduce((s, p) => s + (Number(p.expected_hrs) || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <button onClick={onCancel} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ch/60 hover:text-ch">
        <ArrowLeft className="h-4 w-4" /> Back to library
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-gold">
            {draft.id ? "Edit template" : "New template"}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ch">
            {draft.name || "Untitled template"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="border-border">Cancel</Button>
          <Button onClick={onSave} disabled={saving || !draft.name.trim()} className="bg-gold hover:bg-goldl">
            {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 pt-8 md:grid-cols-2">
        <Field label="Template name">
          <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} maxLength={160} />
        </Field>
        <Field label="Category">
          <Input
            value={draft.category}
            onChange={(e) => onChange({ ...draft, category: e.target.value })}
            placeholder="e.g. Full Renovation, Kitchen, FF&E"
            maxLength={120}
          />
        </Field>
        <Field label="Department">
          <Input value={draft.department} onChange={(e) => onChange({ ...draft, department: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Scope risk level">
          <Select value={draft.scope_risk_level} onValueChange={(v) => onChange({ ...draft, scope_risk_level: v as Risk })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low — well-understood, stable scope</SelectItem>
              <SelectItem value="medium">Medium — some scope variability</SelectItem>
              <SelectItem value="high">High — known scope creep risk</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" className="md:col-span-2">
          <Textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} rows={3} maxLength={4000} />
        </Field>
        <Field label="Tags (comma separated)" className="md:col-span-2">
          <Input
            value={draft.tags.join(", ")}
            onChange={(e) => onChange({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) })}
            placeholder="residential, premium, multi-room"
          />
        </Field>
        <Field label="Triggered by">
          <Input value={draft.triggered_by} onChange={(e) => onChange({ ...draft, triggered_by: e.target.value })} maxLength={500}
            placeholder="Signed contract & 50% deposit" />
        </Field>
        <Field label="Done when">
          <Input value={draft.done_when} onChange={(e) => onChange({ ...draft, done_when: e.target.value })} maxLength={500}
            placeholder="Punch list closed & final invoice paid" />
        </Field>
        <Field label="Common failure modes" className="md:col-span-2">
          <Textarea value={draft.common_failure_modes} onChange={(e) => onChange({ ...draft, common_failure_modes: e.target.value })} rows={3} maxLength={4000}
            placeholder="Scope additions during procurement; vendor lead-time slippage…" />
        </Field>
      </div>

      <div className="mt-10 flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="font-display text-2xl tracking-tight text-ch">Phases</h2>
          <p className="text-sm text-ch/60">
            {draft.phases.length} {draft.phases.length === 1 ? "phase" : "phases"} · {totalScoped.toFixed(1)} scoped hrs
            {billedRate > 0 && ` · ${fmtUsd(totalScoped * billedRate)} potential revenue`}
          </p>
        </div>
        <Button onClick={addPhase} variant="outline" className="border-border">
          <Plus className="mr-2 h-4 w-4" /> Add phase
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {draft.phases.map((phase, i) => (
          <PhaseRow
            key={i}
            phase={phase}
            billedRate={billedRate}
            costPerHour={costPerHour}
            onChange={(next) => setPhases((phs) => phs.map((p, idx) => (idx === i ? next : p)))}
            onRemove={() => setPhases((phs) => phs.filter((_, idx) => idx !== i))}
            onUp={() => movePhase(i, -1)}
            onDown={() => movePhase(i, 1)}
          />
        ))}
        {draft.phases.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-white/60 p-8 text-center text-sm text-ch/60">
            No phases yet. Add the first one above.
          </div>
        )}
      </div>

      {billedRate === 0 && (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-gold/30 bg-goldp/40 p-3 text-sm text-ch/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          Set your billed rate in Rate & Cost Architecture to see live cost / revenue / margin per phase.
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-[0.16em] text-ch/50">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PhaseRow({
  phase, onChange, onRemove, onUp, onDown, billedRate, costPerHour,
}: {
  phase: Phase;
  onChange: (p: Phase) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  billedRate: number;
  costPerHour: number;
}) {
  const [open, setOpen] = useState(false);
  const hrs = Number(phase.expected_hrs) || 0;
  const revenue = phase.billable ? hrs * billedRate : 0;
  const cost = hrs * costPerHour;
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center gap-3 p-3">
        <div className="flex flex-col text-ch/30">
          <button type="button" onClick={onUp} className="hover:text-ch" title="Move up">▲</button>
          <button type="button" onClick={onDown} className="hover:text-ch" title="Move down">▼</button>
        </div>
        <GripVertical className="h-4 w-4 text-ch/30" />
        <Input
          value={phase.name}
          onChange={(e) => onChange({ ...phase, name: e.target.value })}
          placeholder="Phase name"
          className="flex-1 border-0 bg-transparent px-1 font-display text-lg shadow-none focus-visible:ring-0"
          maxLength={120}
        />
        <div className="flex items-center gap-1.5">
          <Input
            type="number" min={0} step={0.5}
            value={phase.expected_hrs}
            onChange={(e) => onChange({ ...phase, expected_hrs: parseFloat(e.target.value) || 0 })}
            className="w-20 text-right"
          />
          <span className="text-xs text-ch/50">hrs</span>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch checked={phase.billable} onCheckedChange={(v) => onChange({ ...phase, billable: v })} />
          <span className="text-xs text-ch/60">{phase.billable ? "Billable" : "Non-bill"}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} className="text-ch/60">
          {open ? "Hide" : "Detail"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-terra hover:text-terra">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {billedRate > 0 && (
        <div className="grid grid-cols-3 gap-px border-t border-border bg-creamd/40 text-center">
          <Stat label="Cost" value={fmtUsd(cost)} />
          <Stat label="Revenue" value={fmtUsd(revenue)} />
          <Stat label="Margin" value={`${fmtUsd(margin)} (${marginPct.toFixed(0)}%)`} accent={margin < 0 ? "danger" : "success"} />
        </div>
      )}

      {open && (
        <div className="space-y-4 border-t border-border bg-cream/30 p-4">
          <Field label="Description">
            <Textarea
              value={phase.description ?? ""}
              onChange={(e) => onChange({ ...phase, description: e.target.value })}
              rows={2} maxLength={2000}
            />
          </Field>
          <Field label="Time benchmark notes">
            <Textarea
              value={phase.time_benchmark_notes ?? ""}
              onChange={(e) => onChange({ ...phase, time_benchmark_notes: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="What drives the hours? Typical drift causes?"
            />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs uppercase tracking-[0.16em] text-ch/50">Process steps</Label>
              <Button
                variant="outline" size="sm" className="border-border"
                onClick={() => onChange({
                  ...phase,
                  steps: [...phase.steps, { description: "", estimated_hrs: 0, sort_order: phase.steps.length }],
                })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add step
              </Button>
            </div>
            <div className="space-y-2">
              {phase.steps.map((step, j) => (
                <div key={j} className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs text-ch/40">{j + 1}.</span>
                  <Input
                    value={step.description}
                    onChange={(e) => onChange({
                      ...phase,
                      steps: phase.steps.map((s, idx) => idx === j ? { ...s, description: e.target.value } : s),
                    })}
                    placeholder="Describe a step in this phase"
                    maxLength={500}
                  />
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => onChange({ ...phase, steps: phase.steps.filter((_, idx) => idx !== j) })}
                    className="text-terra"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {phase.steps.length === 0 && (
                <p className="text-xs text-ch/40">No steps yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "success" | "danger" }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ch/50">{label}</div>
      <div className={cn("font-display text-base", accent === "danger" && "text-terra", accent === "success" && "text-success")}>
        {value}
      </div>
    </div>
  );
}