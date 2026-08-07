import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  FileText,
  History,
  ListChecks,
} from "lucide-react";
import {
  getProjectFinancials,
  projectHoursBreakdownFromEntries,
  projectHoursBreakdownFromPhases,
  fmtUsd,
  type ProjectCostSnapshot,
  type ProjectFinancials,
} from "@/lib/finance";
import { ProjectAssignedTeamSection } from "@/components/projects/ProjectAssignedTeamSection";
import { CLIENT_COMMUNICATION_OPTIONS, clientCommunicationLabel } from "@/lib/client-contact";
import { describeWorkflowPeriod } from "@/lib/sop-workflow-period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StepAssigneeSection,
  sumPhaseAssigneeCost,
  type AssigneePickerMember,
  type StepAssigneeRecord,
} from "@/components/projects/StepAssigneeSection";
import {
  TaskRow,
  ResourcePreviewModal,
  type TaskRowData,
  type TaskRowResource,
} from "@/components/sop/TaskRow";
import {
  assigneeSegmentColor,
  OPEX_SEGMENT_COLOR,
  PROFIT_SEGMENT_COLOR,
} from "@/lib/project-assignee-cost";

/* ─── Design tokens ─── */
const SAGE = "#1f6e3a";
const CHARCOAL = "#2C2C2C";
const MUTED = "#8A7F75";
const TERRA = "#C4714A";
const GOLD = "#B8860B";
const AMBER = "#c8a45a";

function formatAuditField(field: string): string {
  const known: Record<string, string> = {
    hours_logged: "Hours logged",
    remaining_profit: "Remaining profit",
    actual_labor_cost: "Labor cost (at logged hours)",
    hours_over_scope: "Hours over scope",
    scoped_rate: "Scoped rate",
    fixed_fee: "Fixed fee",
    flat_fee_amount: "Flat fee",
  };
  if (known[field]) return known[field];
  if (field.startsWith("phase_expected_hrs:")) {
    return `Expected hours (${field.slice("phase_expected_hrs:".length)})`;
  }
  if (field.startsWith("phase_billable:")) {
    return `Billable (${field.slice("phase_billable:".length)})`;
  }
  return field.replace(/_/g, " ");
}

export type ProjectSubView = null | "details" | "scope" | "timelog" | "audit";

type TeamMember = { id: string; name: string | null; email: string };
type Phase = {
  id: string;
  name: string;
  expected_hrs: number;
  actual_hrs: number;
  billable: boolean;
  sop_phase_id?: string | null;
  project_workflow_attachment_id?: string | null;
  sort_order: number;
};
type Step = {
  id: string;
  project_phase_id: string;
  description: string;
  name?: string | null;
  estimated_hrs: number;
  sort_order: number;
  sop_step_id?: string | null;
  assigned_role?: string | null;
  trigger_description?: string | null;
  completion_criteria?: string | null;
  steps?: TaskRowData["steps"];
  notes?: string | null;
  completed_at?: string | null;
};
type StepResourceLink = { project_step_id: string; resource_id: string };
type StepResourceMeta = TaskRowResource;
type Entry = {
  id: string;
  date: string;
  user_id: string;
  hrs: number;
  billable: boolean;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  import_log_id?: string | null;
  imported_from?: string | null;
  project_phase_id?: string | null;
};
type Milestone = { id: string; label: string; milestone_date: string };
type AuditRow = {
  id: string;
  changed_at: string;
  changed_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
};
type ImportLog = {
  id: string;
  source: string;
  imported_at: string;
  rows_imported: number;
  date_range_start: string | null;
  date_range_end: string | null;
};
type SopPhaseMeta = { id: string; description: string | null };

export type ProjectWorkflowAttachmentDisplay = {
  id: string;
  sop_template_id: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  sort_order: number;
  template_name?: string | null;
};

type ProjectShape = {
  id: string;
  name: string;
  client_name: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_preferred_communication?: string | null;
  status: string;
  pricing_method: string;
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  scoped_hrs?: number | null;
  hourly_scoped_hours?: number | null;
  retainer_monthly_amount?: number | null;
  retainer_duration_months?: number | null;
  start_date: string | null;
  end_date: string | null;
  est_weekly_hrs?: number | null;
  payment_status?: string | null;
  payment_collected?: number | null;
  payment_collected_date?: string | null;
  payment_notes?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

export type ProjectDetailsPatch = {
  name?: string;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_preferred_communication?: string | null;
  status?: string;
  pricing_method?: string;
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  hourly_scoped_hours?: number | null;
  retainer_monthly_amount?: number | null;
  retainer_duration_months?: number | null;
  scoped_hrs?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  est_weekly_hrs?: number | null;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pipeline", label: "Pipeline" },
  { value: "pursuit", label: "Pursuit (BD)" },
  { value: "invoiced", label: "Invoiced" },
  { value: "collected", label: "Collected" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
] as const;

const PRICING_OPTIONS = [
  { value: "flat_fee", label: "Flat fee" },
  { value: "hourly", label: "Hourly" },
  { value: "hybrid", label: "Hybrid" },
  { value: "retainer", label: "Retainer" },
] as const;

function money(n: number) {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
function pct1(n: number) {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}
function fmtDateLong(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function fmtDateShort(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function formatHours(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v}`.replace(/\.0$/, "");
}
function pricingLabel(m: string) {
  if (m === "hourly") return "Hourly";
  if (m === "hybrid") return "Hybrid";
  if (m === "retainer") return "Retainer";
  return "Flat fee";
}
function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function initials(name: string | null, email: string) {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "#e8f4ec", color: SAGE },
  { bg: "#e8eef8", color: "#3d5a80" },
  { bg: "#f0e8f4", color: "#6b4c8a" },
  { bg: "#f4ebe8", color: "#8a5c4c" },
  { bg: "#e8f2f4", color: "#4c7a8a" },
];

function avatarStyle(userId: string, team: TeamMember[], principalId?: string) {
  if (userId === principalId) return AVATAR_PALETTE[0];
  const idx = team.findIndex((t) => t.id === userId);
  return AVATAR_PALETTE[(idx < 0 ? 1 : idx + 1) % AVATAR_PALETTE.length];
}

function parsePhaseSopDescription(desc: string | null | undefined) {
  if (!desc) return { trigger: null as string | null, doneWhen: null as string | null };
  const trigger = desc.match(/Triggered by:\s*(.+)/i)?.[1]?.split("\n")[0]?.trim() ?? null;
  const doneWhen = desc.match(/Done when:\s*(.+)/i)?.[1]?.trim() ?? null;
  return { trigger, doneWhen };
}

/* ─── Ring chart ─── */
function ProfitRing({ profitPct, obligationsPct }: { profitPct: number; obligationsPct: number }) {
  const size = 124;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const profitLen = (Math.max(0, Math.min(100, profitPct)) / 100) * c;
  const obligLen = (Math.max(0, Math.min(100, obligationsPct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(44,44,44,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#7a7874"
        strokeWidth={stroke}
        strokeDasharray={`${obligLen} ${c - obligLen}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={SAGE}
        strokeWidth={stroke}
        strokeDasharray={`${profitLen} ${c - profitLen}`}
        strokeDashoffset={-obligLen}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="46%" textAnchor="middle" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fill: SAGE }}>
        {Math.round(profitPct)}%
      </text>
      <text x="50%" y="58%" textAnchor="middle" style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fill: MUTED }}>
        profit
      </text>
    </svg>
  );
}

/* ─── Hours bar with over-scope extension ─── */
function HoursScopeBar({
  label,
  logged,
  scoped,
  fillColor,
}: {
  label: string;
  logged: number;
  scoped: number;
  fillColor: string;
}) {
  const over = Math.max(0, logged - scoped);
  const fillPct = scoped > 0 ? Math.min(100, (logged / scoped) * 100) : logged > 0 ? 100 : 0;
  const overPct = scoped > 0 && over > 0 ? Math.min(30, (over / scoped) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right text-[12px]" style={{ color: MUTED, fontFamily: "Jost, sans-serif" }}>
        {label}
      </span>
      <div className="relative min-w-0 flex-1 overflow-visible">
        <div className="relative h-2 overflow-visible rounded-full bg-[rgba(44,44,44,0.08)]">
          <div
            className="absolute left-0 top-0 h-2 rounded-full transition-all duration-300"
            style={{ width: `${fillPct}%`, background: fillColor, maxWidth: "100%" }}
          />
          {scoped > 0 && (
            <div
              className="absolute top-[-2px] h-3 w-px bg-[rgba(44,44,44,0.35)]"
              style={{ left: "100%" }}
            />
          )}
          {overPct > 0 && (
            <div
              className="absolute top-0 h-2 rounded-r-full"
              style={{
                left: "100%",
                width: `${overPct}%`,
                background: TERRA,
                maxWidth: "30%",
              }}
            />
          )}
        </div>
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-ch" style={{ fontFamily: "Jost, sans-serif" }}>
        {formatHours(logged)} of {formatHours(scoped)}
      </span>
      {over > 0 && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
          style={{ background: "rgba(196,113,74,0.12)", color: TERRA, fontFamily: "Jost, sans-serif" }}
        >
          +{formatHours(over)} over
        </span>
      )}
    </div>
  );
}

/* ─── Sub-view shell ─── */
function SubViewShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white">
      <div
        className="flex items-center gap-2.5 border-b border-border px-[22px] py-3.5"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-ch/60 hover:text-ch"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </button>
        <span className="h-4 w-px bg-border" />
        <span className="font-display text-base font-normal text-ch">{title}</span>
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-[22px] py-5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between border-b border-border py-2.5 last:border-0"
      style={{ fontFamily: "Jost, sans-serif" }}
    >
      <span className="text-[13px] text-ch/60">{label}</span>
      <span className="text-[13px] font-medium text-ch">{value}</span>
    </div>
  );
}

function DetailRowAnnotated({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0"
      style={{ fontFamily: "Jost, sans-serif" }}
    >
      <span className="shrink-0 text-[13px] text-ch/60">{label}</span>
      <div className="text-right">
        <span className="text-[13px] font-medium text-ch">{value}</span>
        {note ? <div className="mt-0.5 text-[11px] text-ch/45">{note}</div> : null}
      </div>
    </div>
  );
}

function CostStructureAtQuote({ snapshot }: { snapshot: ProjectCostSnapshot }) {
  const abh = Math.round(Number(snapshot.annual_billable_hrs) || 0);
  const weeks = Math.round(Number(snapshot.weeks_per_year) || 0);
  const ownerComp = Number(snapshot.total_owner_comp) || 0;
  const opex = Number(snapshot.total_opex) || 0;
  const team = Number(snapshot.total_team_cost) || 0;
  const costFloor = Number(snapshot.total_cost_floor) || 0;
  const compHr = Number(snapshot.comp_per_hour) || 0;
  const opexHr = Number(snapshot.opex_per_hour) || 0;
  const teamHr = Number(snapshot.team_per_hour) || 0;
  const perHrNote = (rate: number) =>
    abh > 0
      ? `$${rate.toFixed(2)}/hr when spread across ${abh.toLocaleString()} billable hrs`
      : null;

  return (
    <>
      <p className="mb-3 text-[11px] leading-relaxed text-ch/50">
        Firm-wide annual costs locked when this project was quoted — the same inputs that drive
        rate architecture. Per-hour rates shown in the section below are derived from these totals.
      </p>
      <DetailRowAnnotated
        label="Owner compensation"
        value={`${fmtUsd(ownerComp)}/yr`}
        note={perHrNote(compHr)}
      />
      {snapshot.distribution_tax_rate != null && Number(snapshot.distribution_tax_reserve) > 0 && (
        <p
          className="mb-2 -mt-1 pl-0"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#8A7F75" }}
        >
          Distribution tax reserve: {fmtUsd(Number(snapshot.distribution_tax_reserve))} (at{" "}
          {Math.round(Number(snapshot.distribution_tax_rate) * 100)}% effective rate)
        </p>
      )}
      <DetailRowAnnotated
        label="Operating expenses"
        value={`${fmtUsd(opex)}/yr`}
        note={perHrNote(opexHr)}
      />
      {team > 0 && (
        <DetailRowAnnotated
          label="Team cost"
          value={`${fmtUsd(team)}/yr`}
          note={perHrNote(teamHr)}
        />
      )}
      <DetailRowAnnotated
        label="Cost floor"
        value={`${fmtUsd(costFloor)}/yr`}
        note="Compensation + operating expenses + team cost"
      />
      <DetailRow label="Annual billable hours" value={`${abh.toLocaleString()} hrs`} />
      {weeks > 0 && <DetailRow label="Weeks per year" value={String(weeks)} />}
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-ch/50 first:mt-0">
      {children}
    </p>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
      style={{ fontFamily: "Jost, sans-serif" }}
    >
      <span className="text-[13px] text-ch/60">{label}</span>
      <div className="w-full sm:max-w-[220px]">{children}</div>
    </div>
  );
}

function initDetailsDraft(project: ProjectShape) {
  return {
    name: project.name,
    client_name: project.client_name ?? "",
    client_email: project.client_email ?? "",
    client_phone: project.client_phone ?? "",
    client_preferred_communication: project.client_preferred_communication ?? "",
    status: project.status,
    pricing_method: project.pricing_method || "flat_fee",
    flat_fee_amount:
      project.flat_fee_amount != null
        ? String(project.flat_fee_amount)
        : project.fixed_fee != null
          ? String(project.fixed_fee)
          : "",
    scoped_rate: project.scoped_rate != null ? String(project.scoped_rate) : "",
    hourly_scoped_hours:
      project.hourly_scoped_hours != null ? String(project.hourly_scoped_hours) : "",
    retainer_monthly_amount:
      project.retainer_monthly_amount != null ? String(project.retainer_monthly_amount) : "",
    retainer_duration_months:
      project.retainer_duration_months != null ? String(project.retainer_duration_months) : "",
    scoped_hrs: project.scoped_hrs != null ? String(project.scoped_hrs) : "",
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? "",
    est_weekly_hrs: project.est_weekly_hrs != null ? String(project.est_weekly_hrs) : "",
  };
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function PaymentStatusSection({
  project,
  projectFee,
  isAdmin,
  onRecordPayment,
}: {
  project: ProjectShape;
  projectFee: number;
  isAdmin: boolean;
  onRecordPayment?: (args: {
    amount: number;
    payment_collected_date: string;
    payment_notes: string | null;
    project_fee: number;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const status = project.payment_status ?? "unpaid";
  const collected = Number(project.payment_collected) || 0;
  const balance = Math.max(0, projectFee - collected);

  const openModal = () => {
    setAmount(String(Math.round(projectFee || collected || 0)));
    setDate(new Date().toISOString().slice(0, 10));
    setNotes(project.payment_notes ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!onRecordPayment) return;
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    try {
      await onRecordPayment({
        amount: n,
        payment_collected_date: date,
        payment_notes: notes.trim() || null,
        project_fee: projectFee,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeading>Payment status</SectionHeading>
      <div className="mb-4">
        {status === "paid" ? (
          <div>
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "rgba(92,138,110,0.12)", color: SAGE }}>
              Paid in full
            </span>
            {project.payment_collected_date ? (
              <p className="mt-1 text-[11px]" style={{ color: MUTED }}>{fmtDateLong(project.payment_collected_date)}</p>
            ) : null}
          </div>
        ) : status === "partially_paid" ? (
          <div>
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "rgba(184,134,11,0.12)", color: GOLD }}>
              Partial — {money(collected)} received
            </span>
            <p className="mt-1 text-[11px]" style={{ color: MUTED }}>Balance: {money(balance)}</p>
            {isAdmin && onRecordPayment ? (
              <button type="button" onClick={openModal} className="mt-2 text-[12px] underline" style={{ color: GOLD }}>
                Update payment →
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "rgba(196,113,74,0.12)", color: TERRA }}>
              Unpaid
            </span>
            {isAdmin && onRecordPayment ? (
              <button type="button" onClick={openModal} className="mt-2 block text-[12px] underline" style={{ color: GOLD }}>
                Mark as paid →
              </button>
            ) : null}
          </div>
        )}
      </div>

      {open && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[440px] rounded-xl bg-white p-7 shadow-lg">
            <h3 style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 20, color: CHARCOAL, marginBottom: 16 }}>
              Record payment
            </h3>
            <label className="mb-3 block text-[12px]" style={{ color: MUTED }}>Amount received</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mb-3" />
            <label className="mb-3 block text-[12px]" style={{ color: MUTED }}>Date received</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />
            <label className="mb-3 block text-[12px]" style={{ color: MUTED }}>Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-4 w-full rounded-md border px-3 py-2 text-sm" />
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="w-full rounded-lg py-3 text-[13px] font-medium text-white"
              style={{ background: CHARCOAL, fontFamily: "Jost, sans-serif" }}
            >
              {saving ? "Saving…" : "Save →"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full text-center text-[12px] underline" style={{ color: MUTED }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectLifecycleSection({
  project,
  onArchive,
  onUnarchive,
  onDelete,
  onRestore,
  showHeading = true,
}: {
  project: ProjectShape;
  onArchive?: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  showHeading?: boolean;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isArchived = !!project.archived_at;
  const isDeleted = !!project.deleted_at;

  const run = async (fn: () => Promise<void>, close: () => void) => {
    setBusy(true);
    try {
      await fn();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {showHeading && <SectionHeading>Archive & delete</SectionHeading>}
      {isDeleted ? (
        <div className="rounded-lg border border-border bg-creamd/40 px-4 py-3">
          <p className="text-[13px] text-ch">
            This project was deleted on {fmtDateLong(project.deleted_at!)}. Time entries and audit history are preserved.
          </p>
          {onRestore && (
            <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(onRestore, () => {})}>
              Restore project
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border px-4 py-3">
          <p className="text-[12px] text-ch/60">
            Archive hides this project from your main Sightline list. Delete removes it from active views while keeping time and financial history.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isArchived && onUnarchive && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void run(onUnarchive, () => {})}>
                Unarchive
              </Button>
            )}
            {!isArchived && onArchive && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setArchiveOpen(true)}>
                Archive project
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="border-terra/40 text-terra hover:bg-terra/5"
                onClick={() => setDeleteOpen(true)}
              >
                Delete project
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will move to your Archived list. You can unarchive it anytime. Time entries and margin history stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !onArchive} onClick={() => onArchive && void run(onArchive, () => setArchiveOpen(false))}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the project — time entries, cost snapshots, and audit history are kept. You can restore it from Recently deleted on the Sightline page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !onDelete}
              className="bg-terra hover:bg-terra/90"
              onClick={() => onDelete && void run(onDelete, () => setDeleteOpen(false))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProjectDetailsSubView({
  project,
  snapshot,
  fin,
  hoursLogged,
  isAdmin,
  onSave,
  onStatusChange,
  onRecordPayment,
  onArchive,
  onUnarchive,
  onDelete,
  onRestore,
  sopTemplateName,
  workflowAttachments = [],
  workflowPhaseCount,
  workflowTaskCount,
  onAttachWorkflow,
  onChangeWorkflow,
  onRemoveWorkflow,
}: {
  project: ProjectShape;
  snapshot: ProjectCostSnapshot;
  fin: ProjectFinancials;
  hoursLogged: number;
  isAdmin?: boolean;
  onSave?: (patch: ProjectDetailsPatch) => Promise<void>;
  onStatusChange?: (status: string) => void;
  onRecordPayment?: (args: {
    amount: number;
    payment_collected_date: string;
    payment_notes: string | null;
    project_fee: number;
  }) => Promise<void>;
  onArchive?: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  sopTemplateName?: string | null;
  workflowAttachments?: ProjectWorkflowAttachmentDisplay[];
  workflowPhaseCount?: number;
  workflowTaskCount?: number;
  onAttachWorkflow?: () => void;
  onChangeWorkflow?: () => void;
  onRemoveWorkflow?: () => void;
}) {
  const [draft, setDraft] = useState(() => initDetailsDraft(project));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initDetailsDraft(project));
  }, [project]);

  const dirty = useMemo(() => {
    const initial = initDetailsDraft(project);
    return (Object.keys(initial) as (keyof typeof initial)[]).some((k) => draft[k] !== initial[k]);
  }, [draft, project]);

  const effectiveRateDisplay =
    fin.effectiveRate != null
      ? `$${Number(fin.effectiveRate).toFixed(2)}/hr`
      : hoursLogged === 0
        ? "Log time to calculate"
        : "—";

  const handleSave = async () => {
    if (!onSave || !dirty) return;
    const patch: ProjectDetailsPatch = {};
    const initial = initDetailsDraft(project);

    if (draft.name.trim() !== initial.name) patch.name = draft.name.trim() || project.name;
    if (draft.client_name.trim() !== initial.client_name) {
      patch.client_name = draft.client_name.trim() || null;
    }
    if (draft.client_email.trim() !== initial.client_email) {
      patch.client_email = draft.client_email.trim() || null;
    }
    if (draft.client_phone.trim() !== initial.client_phone) {
      patch.client_phone = draft.client_phone.trim() || null;
    }
    if (draft.client_preferred_communication !== initial.client_preferred_communication) {
      patch.client_preferred_communication =
        draft.client_preferred_communication &&
        ["email", "phone", "text", "in_person"].includes(draft.client_preferred_communication)
          ? draft.client_preferred_communication
          : null;
    }
    if (draft.status !== initial.status) {
      if (draft.status === "completed" && project.status !== "completed") {
        onStatusChange?.(draft.status);
      } else {
        patch.status = draft.status;
      }
    }
    if (draft.pricing_method !== initial.pricing_method) patch.pricing_method = draft.pricing_method;

    const flatFee = parseOptionalNumber(draft.flat_fee_amount);
    if (draft.flat_fee_amount !== initial.flat_fee_amount) {
      patch.flat_fee_amount = flatFee;
      if (draft.pricing_method === "flat_fee") patch.fixed_fee = flatFee;
    }

    const rate = parseOptionalNumber(draft.scoped_rate);
    if (draft.scoped_rate !== initial.scoped_rate) patch.scoped_rate = rate;

    const hourlyHrs = parseOptionalNumber(draft.hourly_scoped_hours);
    if (draft.hourly_scoped_hours !== initial.hourly_scoped_hours) {
      patch.hourly_scoped_hours = hourlyHrs;
    }

    const retainerMonthly = parseOptionalNumber(draft.retainer_monthly_amount);
    if (draft.retainer_monthly_amount !== initial.retainer_monthly_amount) {
      patch.retainer_monthly_amount = retainerMonthly;
    }

    const retainerMonths = parseOptionalNumber(draft.retainer_duration_months);
    if (draft.retainer_duration_months !== initial.retainer_duration_months) {
      patch.retainer_duration_months = retainerMonths;
    }

    if (draft.pricing_method === "retainer" && retainerMonthly && retainerMonths) {
      const total = retainerMonthly * retainerMonths;
      patch.flat_fee_amount = total;
      patch.fixed_fee = total;
    }

    const scopedHrs = parseOptionalNumber(draft.scoped_hrs);
    if (draft.scoped_hrs !== initial.scoped_hrs) patch.scoped_hrs = scopedHrs;

    if (draft.start_date !== initial.start_date) patch.start_date = draft.start_date || null;
    if (draft.end_date !== initial.end_date) patch.end_date = draft.end_date || null;

    const weekly = parseOptionalNumber(draft.est_weekly_hrs);
    if (draft.est_weekly_hrs !== initial.est_weekly_hrs) patch.est_weekly_hrs = weekly;

    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  };

  const showRetainer = draft.pricing_method === "retainer";
  const showFlatFee = draft.pricing_method === "flat_fee" || draft.pricing_method === "hybrid";
  const showHourlyFields =
    draft.pricing_method === "hourly" || draft.pricing_method === "hybrid";
  const retainerPreview =
    (Number(draft.retainer_monthly_amount) || 0) * (Number(draft.retainer_duration_months) || 0);

  if (!isAdmin) {
    return (
      <div style={{ fontFamily: "Jost, sans-serif" }}>
        <SectionHeading>Project info</SectionHeading>
        <DetailRow label="Project name" value={project.name} />
        <DetailRow label="Contact name" value={project.client_name ?? "—"} />
        <DetailRow label="Email" value={project.client_email ?? "—"} />
        <DetailRow label="Phone" value={project.client_phone ?? "—"} />
        <DetailRow
          label="Preferred communication"
          value={clientCommunicationLabel(project.client_preferred_communication)}
        />
        <DetailRow label="Status" value={statusLabel(project.status)} />
        <DetailRow label="Pricing method" value={pricingLabel(project.pricing_method)} />
        {project.pricing_method === "retainer" && (
          <>
            <DetailRow
              label="Monthly retainer"
              value={money(Number(project.retainer_monthly_amount) || 0)}
            />
            <DetailRow
              label="Duration"
              value={
                project.retainer_duration_months != null
                  ? `${project.retainer_duration_months} months`
                  : "—"
              }
            />
            <DetailRow label="Total contract value" value={money(fin.totalRevenue)} />
          </>
        )}
        {showFlatFee && (
          <DetailRow
            label="Flat fee amount"
            value={money(Number(project.flat_fee_amount ?? project.fixed_fee) || fin.flatFeeAmount)}
          />
        )}
        {showHourlyFields && (
          <>
            <DetailRow
              label="Billed rate"
              value={project.scoped_rate ? `${fmtUsd(Number(project.scoped_rate))}/hr` : "—"}
            />
            {draft.pricing_method === "hybrid" && (
              <DetailRow
                label="Hourly scoped hours"
                value={
                  project.hourly_scoped_hours != null
                    ? formatHours(Number(project.hourly_scoped_hours))
                    : "—"
                }
              />
            )}
          </>
        )}
        <DetailRow label="Scoped hours total" value={formatHours(fin.scopedHours)} />
        <DetailRow label="Project start date" value={project.start_date ?? "—"} />
        <DetailRow label="Project end date" value={project.end_date ?? "—"} />
        <DetailRow
          label="Est. weekly hours"
          value={project.est_weekly_hrs != null ? formatHours(Number(project.est_weekly_hrs)) : "Auto"}
        />

        <SectionHeading>Workflow</SectionHeading>
        {workflowAttachments.length > 0 ? (
          <>
            <DetailRow
              label="Workflow periods"
              value={`${workflowAttachments.length} on this project — see Scope for tasks`}
            />
            <DetailRow
              label="Scope"
              value={`${workflowPhaseCount ?? 0} phases · ${workflowTaskCount ?? 0} tasks`}
            />
          </>
        ) : sopTemplateName ? (
          <>
            <DetailRow label="Template" value={sopTemplateName} />
            <DetailRow
              label="Scope"
              value={`${workflowPhaseCount ?? 0} phases · ${workflowTaskCount ?? 0} tasks`}
            />
          </>
        ) : (
          <DetailRow label="Template" value="No workflow template applied" />
        )}

        <PaymentStatusSection
          project={project}
          projectFee={fin.totalRevenue}
          isAdmin={false}
        />

        <SectionHeading>Cost structure at quote</SectionHeading>
        <CostStructureAtQuote snapshot={snapshot} />

        <SectionHeading>Rate at time of quote</SectionHeading>
        <DetailRow label="Break-even rate" value={`$${Number(snapshot.break_even_rate).toFixed(2)}/hr`} />
        <DetailRow label="Aligned rate" value={`$${Number(snapshot.aligned_rate).toFixed(2)}/hr`} />
        <DetailRow label="Effective rate" value={effectiveRateDisplay} />
        <DetailRow label="Target margin" value={`${Number(snapshot.target_margin_pct)}%`} />
        <DetailRow label="Snapshot date" value={fmtDateLong(snapshot.snapshotted_at)} />
        {snapshot.is_retroactive && (
          <div
            className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
            style={{ background: "rgba(184,134,11,0.08)", borderColor: "rgba(184,134,11,0.25)", color: "#854F0B" }}
          >
            Captured retroactively using current rate architecture
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Jost, sans-serif" }}>
      <SectionHeading>Project info</SectionHeading>
      <DetailField label="Project name">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </DetailField>
      <DetailField label="Contact name">
        <Input
          value={draft.client_name}
          onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
          placeholder="Jane Smith"
        />
      </DetailField>
      <DetailField label="Email">
        <Input
          type="email"
          value={draft.client_email}
          onChange={(e) => setDraft({ ...draft, client_email: e.target.value })}
          placeholder="jane@example.com"
        />
      </DetailField>
      <DetailField label="Phone">
        <Input
          type="tel"
          value={draft.client_phone}
          onChange={(e) => setDraft({ ...draft, client_phone: e.target.value })}
          placeholder="(555) 555-0100"
        />
      </DetailField>
      <DetailField label="Preferred communication">
        <Select
          value={draft.client_preferred_communication || "__none__"}
          onValueChange={(v) =>
            setDraft({ ...draft, client_preferred_communication: v === "__none__" ? "" : v })
          }
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {CLIENT_COMMUNICATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DetailField>
      <DetailField label="Status">
        <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
          <SelectTrigger className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DetailField>
      <DetailField label="Pricing method">
        <Select
          value={draft.pricing_method}
          onValueChange={(v) => setDraft({ ...draft, pricing_method: v })}
        >
          <SelectTrigger className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICING_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DetailField>

      {isAdmin && (onArchive || onUnarchive || onDelete || onRestore) && (
        <div className="mb-6">
          <ProjectLifecycleSection
            project={project}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
            onRestore={onRestore}
            showHeading
          />
        </div>
      )}

      <SectionHeading>Pricing</SectionHeading>
      {showRetainer && (
        <>
          <DetailField label="Monthly retainer">
            <Input
              type="number"
              min={0}
              step="any"
              value={draft.retainer_monthly_amount}
              onChange={(e) => setDraft({ ...draft, retainer_monthly_amount: e.target.value })}
            />
          </DetailField>
          <DetailField label="Duration (months)">
            <Input
              type="number"
              min={1}
              step={1}
              value={draft.retainer_duration_months}
              onChange={(e) => setDraft({ ...draft, retainer_duration_months: e.target.value })}
            />
          </DetailField>
          {retainerPreview > 0 && (
            <p className="mb-4 text-[12px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
              Total contract value: {money(retainerPreview)}
            </p>
          )}
        </>
      )}
      {showFlatFee && (
        <DetailField label="Flat fee amount">
          <Input
            type="number"
            min={0}
            step="any"
            value={draft.flat_fee_amount}
            onChange={(e) => setDraft({ ...draft, flat_fee_amount: e.target.value })}
          />
        </DetailField>
      )}
      {showHourlyFields && (
        <>
          <DetailField label="Billed rate ($/hr)">
            <Input
              type="number"
              min={0}
              step="any"
              value={draft.scoped_rate}
              onChange={(e) => setDraft({ ...draft, scoped_rate: e.target.value })}
            />
          </DetailField>
          {draft.pricing_method === "hybrid" && (
            <DetailField label="Hourly scoped hours">
              <Input
                type="number"
                min={0}
                step="any"
                value={draft.hourly_scoped_hours}
                onChange={(e) => setDraft({ ...draft, hourly_scoped_hours: e.target.value })}
              />
            </DetailField>
          )}
        </>
      )}
      <DetailField label="Scoped hours total">
        <Input
          type="number"
          min={0}
          step="any"
          value={draft.scoped_hrs}
          onChange={(e) => setDraft({ ...draft, scoped_hrs: e.target.value })}
        />
      </DetailField>

      <SectionHeading>Workflow</SectionHeading>
      {workflowAttachments.length > 0 ? (
        <>
          <p className="mb-2 text-[12px] text-ch/70">
            {workflowAttachments.length} workflow period{workflowAttachments.length === 1 ? "" : "s"} — manage tasks and
            periods on the <span className="font-medium text-ch">Scope and milestones</span> tab.
          </p>
          <p className="mb-2 text-[11px] text-ch/60">
            {workflowPhaseCount ?? 0} phases · {workflowTaskCount ?? 0} tasks total
          </p>
          <div className="mb-4 flex flex-wrap gap-3">
            <a href="/sop-library" className="text-[12px] text-gold underline">
              View in SOP Library →
            </a>
            {onAttachWorkflow ? (
              <button type="button" className="text-[12px] text-gold underline" onClick={onAttachWorkflow}>
                + Add workflow period
              </button>
            ) : null}
            {onChangeWorkflow ? (
              <button type="button" className="text-[12px] text-ch/60 underline" onClick={onChangeWorkflow}>
                Replace all workflows
              </button>
            ) : null}
            {onRemoveWorkflow ? (
              <button type="button" className="text-[12px] text-terra underline" onClick={onRemoveWorkflow}>
                Remove all workflows
              </button>
            ) : null}
          </div>
        </>
      ) : sopTemplateName ? (
        <div className="mb-4 space-y-1">
          <p className="text-[13px] font-medium text-ch">{sopTemplateName}</p>
          <p className="text-[11px] text-ch/60">
            {workflowPhaseCount ?? 0} phases · {workflowTaskCount ?? 0} tasks
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a href="/sop-library" className="text-[12px] text-gold underline">
              View in SOP Library →
            </a>
            {onAttachWorkflow ? (
              <button type="button" className="text-[12px] text-gold underline" onClick={onAttachWorkflow}>
                + Add workflow period
              </button>
            ) : null}
            {onChangeWorkflow ? (
              <button type="button" className="text-[12px] text-ch/60 underline" onClick={onChangeWorkflow}>
                Replace all workflows
              </button>
            ) : null}
            {onRemoveWorkflow ? (
              <button type="button" className="text-[12px] text-terra underline" onClick={onRemoveWorkflow}>
                Remove all workflows
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-[12px] text-ch/60">No workflow template applied.</p>
          {onAttachWorkflow ? (
            <button type="button" className="mt-2 text-[13px] text-gold underline" onClick={onAttachWorkflow}>
              + Attach a workflow →
            </button>
          ) : null}
        </div>
      )}

      <PaymentStatusSection
        project={project}
        projectFee={fin.totalRevenue}
        isAdmin={!!isAdmin}
        onRecordPayment={onRecordPayment}
      />

      <SectionHeading>Schedule</SectionHeading>
      <DetailField label="Project start date">
        <Input
          type="date"
          value={draft.start_date}
          onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
        />
      </DetailField>
      <DetailField label="Project end date">
        <Input
          type="date"
          value={draft.end_date}
          onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
        />
      </DetailField>
      <DetailField label="Est. weekly hours">
        <Input
          type="number"
          min={0}
          step="any"
          placeholder="Auto from scoped hrs"
          value={draft.est_weekly_hrs}
          onChange={(e) => setDraft({ ...draft, est_weekly_hrs: e.target.value })}
        />
      </DetailField>

      {isAdmin && project.id ? <ProjectAssignedTeamSection projectId={project.id} /> : null}

      <SectionHeading>Cost structure at quote</SectionHeading>
      <CostStructureAtQuote snapshot={snapshot} />

      <SectionHeading>Rate at time of quote</SectionHeading>
      <DetailRow label="Break-even rate" value={`$${Number(snapshot.break_even_rate).toFixed(2)}/hr`} />
      <DetailRow label="Aligned rate" value={`$${Number(snapshot.aligned_rate).toFixed(2)}/hr`} />
      <DetailRow label="Effective rate" value={effectiveRateDisplay} />
      <DetailRow label="Target margin" value={`${Number(snapshot.target_margin_pct)}%`} />
      <DetailRow label="Snapshot date" value={fmtDateLong(snapshot.snapshotted_at)} />
      {snapshot.is_retroactive && (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
          style={{ background: "rgba(184,134,11,0.08)", borderColor: "rgba(184,134,11,0.25)", color: "#854F0B" }}
        >
          Captured retroactively using current rate architecture
        </div>
      )}

      {onSave && (
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => setDraft(initDetailsDraft(project))}
          >
            Reset
          </Button>
          <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}

    </div>
  );
}

/* ─── Main export ─── */
export function ProjectDetailView({
  project,
  snapshot,
  phases,
  steps,
  entries,
  team,
  milestones,
  audit,
  importLogs,
  sopPhases,
  hoursLogged,
  lastEntryDate,
  principalId,
  onSaveMilestone,
  onDeleteMilestone,
  isAdmin,
  onSaveProjectDetails,
  onStatusChange,
  onRecordPayment,
  financials: financialsProp,
  stepAssignees = [],
  assigneeMembers = [],
  assigneePrincipalName = "Principal",
  assigneesNewerThanSnapshot = false,
  onUpsertStepAssignee,
  onDeleteStepAssignee,
  onRefreshCostSnapshot,
  onAttachSopTemplate,
  onAssignToPhase,
  onCreateProjectStep,
  sopTemplateName,
  workflowAttachments = [],
  onChangeWorkflow,
  onRemoveWorkflow,
  onRemoveWorkflowAttachment,
  onToggleStepComplete,
  onToggleStepItemComplete,
  stepResources = [],
  stepResourceMeta = [],
  initialSubView,
  onArchive,
  onUnarchive,
  onDelete,
  onRestore,
}: {
  project: ProjectShape;
  snapshot: ProjectCostSnapshot | null;
  phases: Phase[];
  steps: Step[];
  entries: Entry[];
  team: TeamMember[];
  milestones: Milestone[];
  audit: AuditRow[];
  importLogs: ImportLog[];
  sopPhases: SopPhaseMeta[];
  hoursLogged: number;
  lastEntryDate: string | null;
  principalId?: string;
  onSaveMilestone?: (label: string, date: string) => Promise<void>;
  onDeleteMilestone?: (id: string) => Promise<void>;
  isAdmin?: boolean;
  onSaveProjectDetails?: (patch: ProjectDetailsPatch) => Promise<void>;
  onStatusChange?: (status: string) => void;
  onRecordPayment?: (args: {
    amount: number;
    payment_collected_date: string;
    payment_notes: string | null;
    project_fee: number;
  }) => Promise<void>;
  financials?: ProjectFinancials | null;
  stepAssignees?: StepAssigneeRecord[];
  assigneeMembers?: AssigneePickerMember[];
  assigneePrincipalName?: string;
  assigneesNewerThanSnapshot?: boolean;
  onUpsertStepAssignee?: (stepId: string, payload: {
    assignee_kind: "member" | "principal";
    firm_member_id?: string | null;
    estimated_hrs?: number;
    is_billable?: boolean;
  }) => Promise<void>;
  onDeleteStepAssignee?: (assigneeId: string) => Promise<void>;
  onRefreshCostSnapshot?: () => Promise<void>;
  onAttachSopTemplate?: () => void;
  /** Creates a task under the phase when needed, then saves the assignee. */
  onAssignToPhase?: (
    phaseId: string,
    phaseName: string,
    payload: {
      assignee_kind: "member" | "principal";
      firm_member_id?: string | null;
      estimated_hrs?: number;
      is_billable?: boolean;
    },
  ) => Promise<void>;
  onCreateProjectStep?: (
    phaseId: string,
    description: string,
    estimatedHrs?: number,
  ) => Promise<void>;
  sopTemplateName?: string | null;
  workflowAttachments?: ProjectWorkflowAttachmentDisplay[];
  onChangeWorkflow?: () => void;
  onRemoveWorkflow?: () => void;
  onRemoveWorkflowAttachment?: (attachmentId: string, label: string) => void;
  onToggleStepComplete?: (stepId: string, completed: boolean) => Promise<void>;
  onToggleStepItemComplete?: (stepId: string, order: number, completed: boolean) => Promise<void>;
  stepResources?: StepResourceLink[];
  stepResourceMeta?: StepResourceMeta[];
  initialSubView?: ProjectSubView;
  onArchive?: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
}) {
  const [activeSubView, setActiveSubView] = useState<ProjectSubView>(initialSubView ?? null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [previewResource, setPreviewResource] = useState<TaskRowResource | null>(null);
  const [msLabel, setMsLabel] = useState("");
  const [msDate, setMsDate] = useState("");
  const [personFilters, setPersonFilters] = useState<Set<string>>(new Set());
  const [billableFilter, setBillableFilter] = useState(false);
  const [nonBillableFilter, setNonBillableFilter] = useState(false);

  const sopPhaseMap = useMemo(() => new Map(sopPhases.map((p) => [p.id, p])), [sopPhases]);

  const scopeGroups = useMemo(() => {
    const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
    const groups: {
      key: string;
      title: string;
      periodLabel: string | null;
      dateRange: string | null;
      phases: Phase[];
      attachmentId?: string;
    }[] = [];

    for (const att of workflowAttachments) {
      const attPhases = sortedPhases.filter((p) => p.project_workflow_attachment_id === att.id);
      if (!attPhases.length) continue;
      const title = att.template_name ?? sopTemplateName ?? "Workflow";
      const { label, dateRange } = describeWorkflowPeriod(att);
      groups.push({
        key: att.id,
        attachmentId: att.id,
        title,
        periodLabel: label,
        dateRange,
        phases: attPhases,
      });
    }

    const covered = new Set(groups.flatMap((g) => g.phases.map((p) => p.id)));
    const other = sortedPhases.filter((p) => !covered.has(p.id));
    if (other.length) {
      groups.push({
        key: "other-phases",
        title: workflowAttachments.length ? "Other phases" : "Phases",
        periodLabel: null,
        dateRange: null,
        phases: other,
      });
    }
    return groups;
  }, [phases, workflowAttachments, sopTemplateName]);

  const projectTeamIds = useMemo(() => {
    const ids = new Set(entries.map((e) => e.user_id));
    return team.filter((t) => ids.has(t.id));
  }, [entries, team]);

  const filteredEntries = useMemo(() => {
    let list = [...entries];
    if (personFilters.size > 0) list = list.filter((e) => personFilters.has(e.user_id));
    if (billableFilter && !nonBillableFilter) list = list.filter((e) => e.billable);
    if (nonBillableFilter && !billableFilter) list = list.filter((e) => !e.billable);
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, personFilters, billableFilter, nonBillableFilter]);

  const groupedByDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of filteredEntries) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return [...m.entries()];
  }, [filteredEntries]);

  const auditBySession = useMemo(() => {
    const groups = new Map<string, AuditRow[]>();
    for (const a of audit) {
      const key = `${a.changed_at}|${a.changed_by}`;
      const arr = groups.get(key) ?? [];
      arr.push(a);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [audit]);

  const hoursLoggedThisMonth = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    return entries
      .filter((e) => (e.date as string) >= monthStartIso)
      .reduce((s, e) => s + Number(e.hrs || 0), 0);
  }, [entries]);

  const projectForCalc = {
    ...project,
    flat_fee_amount:
      project.flat_fee_amount != null
        ? project.flat_fee_amount
        : project.pricing_method === "flat_fee" && project.fixed_fee
          ? project.fixed_fee
          : project.flat_fee_amount,
  };

  const loggedBreakdown = useMemo(
    () => projectHoursBreakdownFromEntries(entries),
    [entries],
  );
  const phaseScopedBreakdown = useMemo(
    () => projectHoursBreakdownFromPhases(phases),
    [phases],
  );
  const billableLogged = loggedBreakdown.billableLogged;
  const nonbillableLogged = loggedBreakdown.nonBillableLogged;

  const fin: ProjectFinancials | null =
    financialsProp ??
    (snapshot
      ? getProjectFinancials({
          project: projectForCalc,
          snapshot,
          hoursLogged,
          hoursLoggedThisMonth,
          lastEntryDate,
          billableHoursLogged: billableLogged,
          nonBillableHoursLogged: nonbillableLogged,
          billableHoursScoped: phaseScopedBreakdown.billableScoped,
          nonBillableHoursScoped: phaseScopedBreakdown.nonBillableScoped,
        })
      : null);

  const principalBurdenedRate = Number(snapshot?.comp_per_hour) || 0;

  const assigneesByStep = useMemo(() => {
    const m = new Map<string, StepAssigneeRecord[]>();
    for (const raw of stepAssignees) {
      const a = raw as StepAssigneeRecord & { project_step_id: string };
      const sid = a.project_step_id;
      if (!sid) continue;
      const arr = m.get(sid) ?? [];
      arr.push(a);
      m.set(sid, arr);
    }
    return m;
  }, [stepAssignees]);

  const resourcesById = useMemo(() => {
    const map = new Map<string, TaskRowResource>();
    for (const r of stepResourceMeta) map.set(r.id, r);
    return map;
  }, [stepResourceMeta]);

  const resourcesByStep = useMemo(() => {
    const map = new Map<string, TaskRowResource[]>();
    for (const link of stepResources) {
      const resource = resourcesById.get(link.resource_id);
      if (!resource) continue;
      const list = map.get(link.project_step_id) ?? [];
      list.push(resource);
      map.set(link.project_step_id, list);
    }
    return map;
  }, [stepResources, resourcesById]);

  const billableScoped =
    fin?.billableScopedFromAssignees != null
      ? fin.billableScopedFromAssignees
      : phaseScopedBreakdown.billableScoped;
  const nonbillableScoped =
    fin?.nonBillableScopedFromAssignees != null
      ? fin.nonBillableScopedFromAssignees
      : phaseScopedBreakdown.nonBillableScoped;
  const billableOver = fin?.billableOverHours ?? Math.max(0, billableLogged - billableScoped);
  const nonbillableOver =
    fin?.nonBillableOverHours ?? Math.max(0, nonbillableLogged - nonbillableScoped);

  const phaseLogged = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (!e.project_phase_id) continue;
      m.set(e.project_phase_id, (m.get(e.project_phase_id) ?? 0) + Number(e.hrs || 0));
    }
    return m;
  }, [entries]);

  const rev = Math.max(fin?.totalRevenue ?? 1, 1);
  const segPct = (v: number) => (v / rev) * 100;

  const showActualCosts = !!fin && fin.costOverHours > 0 && hoursLogged > 0;
  const displayComp = showActualCosts ? fin!.actualCompAllocation : fin?.compAllocation ?? 0;
  const displayOpex = showActualCosts ? fin!.actualOpexAllocation : fin?.opexAllocation ?? 0;
  const displayTeam = showActualCosts ? fin!.actualTeamAllocation : fin?.teamAllocation ?? 0;
  const displayTax = showActualCosts ? fin!.actualTaxReserve : fin?.taxReserve ?? 0;
  const displayProfit = showActualCosts ? fin!.marginRemaining : fin?.netProfit ?? 0;
  const displayAssignees = showActualCosts
    ? fin!.actualAssigneeAllocations
    : fin?.assigneeAllocations ?? [];

  const transitionClass = "transition-opacity duration-150 ease-out";

  if (!snapshot || !fin) {
    return (
      <div className="rounded-lg border border-border bg-white p-6 text-[13px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
        Cost snapshot not yet captured for this project.
      </div>
    );
  }

  const isRetainerProject = project.pricing_method === "retainer";
  const retainerMetrics = fin.retainerMetrics;
  const snapshotAligned = Number(snapshot.aligned_rate) || 0;
  const snapshotBreakEven = Number(snapshot.break_even_rate) || 0;

  function retainerRateColor(rate: number | null): string {
    if (rate == null) return MUTED;
    if (rate >= snapshotAligned) return SAGE;
    if (rate >= snapshotBreakEven) return GOLD;
    return TERRA;
  }

  const tiles = [
    { key: "details" as const, label: "Project details", Icon: FileText },
    { key: "scope" as const, label: "Scope and milestones", Icon: ListChecks },
    { key: "timelog" as const, label: "Time log", Icon: Clock },
    { key: "audit" as const, label: "Audit history", Icon: History },
  ];

  /* ─── PRIMARY VIEW ─── */
  const primaryView = (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[20px] font-normal text-ch">{project.name}</h1>
            {project.client_name && (
              <p className="mt-0.5 text-[13px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                {project.client_name}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && (onArchive || onUnarchive || onDelete || onRestore) && (
              <button
                type="button"
                onClick={() => setActiveSubView("details")}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-ch/60 underline-offset-2 hover:text-ch hover:underline"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Archive or delete
              </button>
            )}
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide"
              style={{ background: "rgba(44,44,44,0.06)", color: MUTED, fontFamily: "Jost, sans-serif" }}
            >
              {statusLabel(project.status)}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide"
              style={{ background: "rgba(44,44,44,0.06)", color: MUTED, fontFamily: "Jost, sans-serif" }}
            >
              {pricingLabel(project.pricing_method)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] italic text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
          Cost structure locked {fmtDateLong(snapshot.snapshotted_at)}
        </p>
      </div>

      {/* Section 1 — Profit pool or retainer performance */}
      {isRetainerProject && retainerMetrics ? (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
                This month
              </p>
              <div className="font-display text-[32px] leading-none text-ch">{money(retainerMetrics.monthlyFee)}</div>
              <p className="mt-2 text-[12px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                Monthly fee
              </p>
              <p className="mt-3 text-[12px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                Hours logged this month: {retainerMetrics.currentMonthHours.toFixed(1)}
              </p>
              <div
                className="mt-2 font-display text-[24px]"
                style={{ color: retainerRateColor(retainerMetrics.currentMonthRealizedRate) }}
              >
                {retainerMetrics.currentMonthRealizedRate != null
                  ? `${money(retainerMetrics.currentMonthRealizedRate)}/hr`
                  : "—"}
              </div>
              <p className="text-[11px] text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
                What each hour of work earned this month
              </p>
              {retainerMetrics.currentMonthRealizedRate != null && (
                <p
                  className="mt-2 flex items-center gap-1.5 text-[12px]"
                  style={{
                    fontFamily: "Jost, sans-serif",
                    color: retainerRateColor(retainerMetrics.currentMonthRealizedRate),
                  }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
                  {retainerMetrics.currentMonthRealizedRate >= snapshotAligned
                    ? "Healthy this month"
                    : retainerMetrics.currentMonthRealizedRate >= snapshotBreakEven
                      ? "Covering costs — below target"
                      : "Below your cost floor this month"}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
                {retainerMetrics.monthsActive} months active
              </p>
              <div className="font-display text-[22px] text-ch">{money(retainerMetrics.totalRevenue)}</div>
              <p className="mt-1 text-[12px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                Total revenue since engagement began
              </p>
              <p className="mt-3 text-[12px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                {formatHours(hoursLogged)} total
              </p>
              <div
                className="mt-1 font-display text-[20px]"
                style={{ color: retainerRateColor(retainerMetrics.cumulativeRealizedRate) }}
              >
                {retainerMetrics.cumulativeRealizedRate != null
                  ? `${money(retainerMetrics.cumulativeRealizedRate)}/hr`
                  : "—"}
              </div>
              <p className="text-[11px] text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
                Average revenue per hour since start
              </p>
            </div>
          </div>
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
              Where this month&apos;s fee goes
            </p>
            <p className="text-[12px] leading-relaxed text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
              {retainerMetrics.currentMonthHours <= 0
                ? `Your ${money(retainerMetrics.monthlyFee)} monthly fee is waiting on time entries. Log hours to see how labor costs compare.`
                : retainerMetrics.monthlyMargin >= 0
                  ? `Of your ${money(retainerMetrics.monthlyFee)} this month, ${formatHours(retainerMetrics.currentMonthHours)} of work consumed ${money(retainerMetrics.monthlyCostAllocation)}. Your firm kept ${money(retainerMetrics.monthlyMargin)}.`
                  : `Of your ${money(retainerMetrics.monthlyFee)} this month, ${formatHours(retainerMetrics.currentMonthHours)} of work consumed more than the fee covers. This month eroded ${money(Math.abs(retainerMetrics.monthlyMargin))} in firm reserves.`}
            </p>
          </div>
        </>
      ) : (
      <div className="flex flex-wrap items-center gap-6">
        <ProfitRing
          profitPct={showActualCosts ? fin.marginRemainingPct : fin.netProfitPct}
          obligationsPct={
            fin.totalRevenue > 0
              ? ((showActualCosts ? fin.actualCostAllocation + fin.actualTaxReserve : fin.totalCostAllocation + fin.taxReserve) /
                  fin.totalRevenue) *
                100
              : 0
          }
        />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[34px] leading-none" style={{ color: SAGE }}>
            {money(fin.marginRemaining)}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
            remaining in your profit pool
            <br />
            from a {money(fin.totalRevenue)} fee
          </p>
          {hoursLogged > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-[13px]" style={{ fontFamily: "Jost, sans-serif" }}>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: fin.isAboveTarget ? SAGE : fin.isBelowTarget ? TERRA : MUTED }}
              />
              {fin.isAboveTarget
                ? `${Math.abs(Math.round(fin.marginVariance * 10) / 10).toFixed(1)}% above your target`
                : fin.isBelowTarget
                  ? `${Math.abs(Math.round(fin.marginVariance * 10) / 10).toFixed(1)}% below your target`
                  : "At your target margin"}
            </p>
          ) : (
            <p className="mt-2 text-[13px] italic text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
              No hours logged yet — profit reflects full scoped potential
            </p>
          )}
        </div>
      </div>
      )}

      {/* Payment — visible on main project view */}
      <div
        className="rounded-lg border px-4 py-3.5"
        style={{ borderColor: "rgba(44,44,44,0.10)", background: "#FAF7F2" }}
      >
        <PaymentStatusSection
          project={project}
          projectFee={fin.totalRevenue}
          isAdmin={!!isAdmin}
          onRecordPayment={onRecordPayment}
        />
      </div>

      {/* Section 2 — Where the fee goes */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
          {showActualCosts ? "Where the fee goes at logged hours" : "Where the fee goes"}
        </p>
        {showActualCosts && (
          <p className="mb-2 text-[11px] leading-relaxed text-ch/55" style={{ fontFamily: "Jost, sans-serif" }}>
            {formatHours(fin.costOverHours)} over scope — your pay, team labor, and running costs scale with every
            hour worked. Tax reserve adjusts on the reduced margin.
          </p>
        )}
        <div className="relative h-2 overflow-hidden rounded-full">
          <div className="flex h-full w-full">
            {fin.costBasisMethod === "task_assignee" ? (
              <>
                {displayAssignees.map((a, i) =>
                  a.costContribution > 0 ? (
                    <div
                      key={`${a.memberName}-${i}`}
                      style={{
                        width: `${segPct(a.costContribution)}%`,
                        background: assigneeSegmentColor(i, a.isPrincipal),
                      }}
                    />
                  ) : null,
                )}
                {displayOpex > 0 && (
                  <div style={{ width: `${segPct(displayOpex)}%`, background: OPEX_SEGMENT_COLOR }} />
                )}
              </>
            ) : (
              <>
                {displayComp > 0 && (
                  <div style={{ width: `${segPct(displayComp)}%`, background: "#3d3c3a" }} />
                )}
                {displayOpex > 0 && (
                  <div style={{ width: `${segPct(displayOpex)}%`, background: "#7a7874" }} />
                )}
                {displayTeam > 0 && (
                  <div style={{ width: `${segPct(displayTeam)}%`, background: "#aeacaa" }} />
                )}
              </>
            )}
            {displayTax > 0 && (
              <div
                className="relative"
                style={{
                  width: `${segPct(displayTax)}%`,
                  background: "#d4d2d0",
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 6px)",
                }}
              />
            )}
            {displayProfit > 0 && (
              <div style={{ width: `${segPct(displayProfit)}%`, background: PROFIT_SEGMENT_COLOR }} />
            )}
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[12px] text-ch/70" style={{ fontFamily: "Jost, sans-serif" }}>
          {fin.costBasisMethod === "task_assignee" ? (
            <>
              {displayAssignees.map((a, i) => (
                <div key={`${a.memberName}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: assigneeSegmentColor(i, a.isPrincipal) }}
                    />
                    {a.memberName}
                    <span className="text-[10px] text-ch/45">
                      {formatHours(a.totalHrs)} @ ${a.burdenedRatePerHour.toFixed(2)}/hr
                    </span>
                  </span>
                  <span>
                    {money(a.costContribution)} ({pct1(segPct(a.costContribution))})
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: OPEX_SEGMENT_COLOR }} />
                  Running costs (OpEx)
                </span>
                <span>
                  {money(displayOpex)} ({pct1(segPct(displayOpex))})
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { label: "Your pay", amt: displayComp, color: "#3d3c3a" },
                { label: "Running costs", amt: displayOpex, color: "#7a7874" },
                ...(displayTeam > 0 ? [{ label: "Team", amt: displayTeam, color: "#aeacaa" }] : []),
                { label: "Tax reserve", amt: displayTax, color: "#d4d2d0" },
                { label: showActualCosts ? "Remaining profit" : "Profit", amt: displayProfit, color: SAGE },
              ].map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label} {money(s.amt)} ({pct1(segPct(s.amt))})
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 font-display text-[13px] italic text-ch/70">
          {showActualCosts ? (
            <>
              At {formatHours(hoursLogged)} logged ({formatHours(fin.costOverHours)} over scope), labor and overhead
              total {money(fin.actualCostAllocation)} — leaving {money(fin.marginRemaining)} in remaining profit
              from the {money(fin.totalRevenue)} fee.
            </>
          ) : fin.costBasisMethod === "task_assignee" && fin.assigneeAllocations.length > 0 ? (
            <>
              Of your {money(fin.totalRevenue)} fee,{" "}
              {fin.assigneeAllocations
                .map((a) => `${a.memberName}'s time accounts for ${money(a.costContribution)}`)
                .join(", ")}
              , and running costs for {money(fin.opexAllocation)}. Stay within scope and{" "}
              {money(fin.netProfit)} is yours to keep.
            </>
          ) : (
            <>
              Of your {money(fin.totalRevenue)} fee, about {money(fin.totalCostAllocation)} covers what it costs to
              deliver. Stay within scope and {money(fin.netProfit)} is yours to keep.
            </>
          )}
        </p>
        {assigneesNewerThanSnapshot && onRefreshCostSnapshot && (
          <div
            className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
            style={{ background: "rgba(184,134,11,0.08)", borderColor: "rgba(184,134,11,0.25)", color: "#854F0B" }}
          >
            Task assignees have been added since this project&apos;s cost snapshot was taken. Update the snapshot to
            reflect the actual team cost for this project.{" "}
            <button type="button" className="font-medium underline" onClick={() => void onRefreshCostSnapshot()}>
              Update snapshot →
            </button>
          </div>
        )}
      </div>

      {/* Section 3 — Hours */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ch/50" style={{ fontFamily: "Jost, sans-serif" }}>
          Hours
        </p>
        {billableScoped > 0 && (
          <HoursScopeBar label="Billable" logged={billableLogged} scoped={billableScoped} fillColor={SAGE} />
        )}
        {nonbillableScoped > 0 && (
          <HoursScopeBar label="Non-billable" logged={nonbillableLogged} scoped={nonbillableScoped} fillColor={AMBER} />
        )}
        {nonbillableOver > 0 && (
          <div
            className="mt-2 rounded-lg border px-3.5 py-2.5 text-[12px]"
            style={{ background: "#fdf7ee", borderColor: "#f0d9a8", color: "#7a5c1e", fontFamily: "Jost, sans-serif" }}
          >
            Non-billable hours are {formatHours(nonbillableOver)} over scope. This is where your profit is eroding — the
            fee covers it, but less remains.
          </div>
        )}
        {billableOver > 0 && fin.effectiveRate != null && (
          <div
            className="mt-2 rounded-lg border px-3.5 py-2.5 text-[12px]"
            style={{ background: "rgba(196,113,74,0.08)", borderColor: "rgba(196,113,74,0.25)", color: "#7A3A22", fontFamily: "Jost, sans-serif" }}
          >
            Billable hours are {formatHours(billableOver)} over scope. Your effective rate has dropped to $
            {Math.round(fin.effectiveRate).toLocaleString()}/hr.
          </div>
        )}
      </div>

      {/* Section 4 — Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSubView(key)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[14px] border border-border bg-creamd/40 p-3 text-center transition-colors hover:border-ch/30"
          >
            <Icon className="h-[22px] w-[22px] text-ch/50" strokeWidth={1.5} />
            <span className="text-[11px] font-medium text-ch" style={{ fontFamily: "Jost, sans-serif" }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  /* ─── DETAILS SUB-VIEW ─── */
  const detailsView = (
    <ProjectDetailsSubView
      project={project}
      snapshot={snapshot}
      fin={fin}
      hoursLogged={hoursLogged}
      isAdmin={isAdmin}
      onSave={isAdmin ? onSaveProjectDetails : undefined}
      onStatusChange={onStatusChange}
      onRecordPayment={onRecordPayment}
      onArchive={isAdmin ? onArchive : undefined}
      onUnarchive={isAdmin ? onUnarchive : undefined}
      onDelete={isAdmin ? onDelete : undefined}
      onRestore={isAdmin ? onRestore : undefined}
      sopTemplateName={sopTemplateName}
      workflowAttachments={workflowAttachments}
      workflowPhaseCount={phases.length}
      workflowTaskCount={steps.length}
      onAttachWorkflow={isAdmin ? onAttachSopTemplate : undefined}
      onChangeWorkflow={isAdmin ? onChangeWorkflow : undefined}
      onRemoveWorkflow={isAdmin ? onRemoveWorkflow : undefined}
    />
  );

  /* ─── SCOPE SUB-VIEW ─── */
  const scopeView = (
    <div style={{ fontFamily: "Jost, sans-serif" }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-ch/60">
            {workflowAttachments.length > 0
              ? `${workflowAttachments.length} workflow period${workflowAttachments.length === 1 ? "" : "s"} on this project`
              : sopTemplateName
                ? `Scope from template: ${sopTemplateName}`
                : "Define phases, tasks, and who does the work."}
          </p>
        </div>
        {isAdmin && onAttachSopTemplate && (
          <button
            type="button"
            onClick={onAttachSopTemplate}
            className="shrink-0 rounded-md border border-gold/40 bg-goldp/30 px-3 py-1.5 text-[12px] font-medium text-ch hover:bg-goldp/50"
          >
            {workflowAttachments.length > 0 || phases.some((p) => p.sop_phase_id)
              ? "+ Add workflow period"
              : "+ Attach SOP template"}
          </button>
        )}
      </div>

      {phases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-creamd/30 px-4 py-8 text-center">
          <p className="text-[13px] text-ch/60">No phases yet.</p>
          <p className="mt-1 text-[12px] text-ch/45">
            Attach an SOP template to copy phases and tasks, or add phases manually.
          </p>
          {isAdmin && onAttachSopTemplate && (
            <button
              type="button"
              onClick={onAttachSopTemplate}
              className="mt-4 text-[13px] font-medium text-gold hover:underline"
            >
              Browse SOP library →
            </button>
          )}
        </div>
      ) : (
        scopeGroups.map((group) => {
          const showGroupHeader =
            Boolean(group.attachmentId) ||
            group.key === "other-phases" ||
            scopeGroups.length > 1;

          return (
          <div key={group.key} className="mb-8 last:mb-0">
            {showGroupHeader ? (
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-lg bg-cream/50 px-3 py-2">
                <div>
                  <p className="text-[13px] font-semibold text-ch">{group.title}</p>
                  {group.periodLabel ? (
                    <p className="text-[12px] font-medium text-ch/70">{group.periodLabel}</p>
                  ) : null}
                  {group.dateRange ? (
                    <p className="text-[12px] text-ch/55">{group.dateRange}</p>
                  ) : null}
                </div>
                {group.attachmentId && onRemoveWorkflowAttachment ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-terra underline hover:no-underline"
                    onClick={() => {
                      const label = [group.title, group.periodLabel, group.dateRange]
                        .filter(Boolean)
                        .join(" — ");
                      onRemoveWorkflowAttachment(group.attachmentId!, label);
                    }}
                  >
                    Remove workflow
                  </button>
                ) : null}
              </div>
            ) : null}
            {group.phases.map((phase) => {
          const phaseSteps = steps.filter((s) => s.project_phase_id === phase.id).sort((a, b) => a.sort_order - b.sort_order);
          const logged = phaseLogged.get(phase.id) ?? Number(phase.actual_hrs || 0);
          const scoped = Number(phase.expected_hrs || 0);
          const over = Math.max(0, logged - scoped);
          const collapsed = collapsedPhases.has(phase.id);
          const sopMeta = phase.sop_phase_id ? sopPhaseMap.get(phase.sop_phase_id) : null;
          const { trigger, doneWhen } = parsePhaseSopDescription(sopMeta?.description);

          return (
            <div key={phase.id} className="border-b border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-left"
                onClick={() => {
                  setCollapsedPhases((prev) => {
                    const next = new Set(prev);
                    if (next.has(phase.id)) next.delete(phase.id);
                    else next.add(phase.id);
                    return next;
                  });
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-ch/40 transition-transform", collapsed && "-rotate-90")} />
                  <span className="text-[14px] font-medium text-ch">{phase.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={
                      phase.billable
                        ? { background: "rgba(31,110,58,0.1)", color: SAGE }
                        : { background: "rgba(200,164,90,0.15)", color: "#7a5c1e" }
                    }
                  >
                    {phase.billable ? "Billable" : "Non-billable"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[12px] text-ch/60">
                  <span className="tabular-nums">
                    {formatHours(logged)} / {formatHours(scoped)}
                  </span>
                  {over > 0 && <span style={{ color: TERRA }}>+{formatHours(over)}</span>}
                </div>
              </button>
              {!collapsed && (
                <div className="pb-3 pl-6">
                  {(trigger || doneWhen) && (
                    <div className="mb-2 text-[11px] italic text-ch/50">
                      {trigger && <div>Triggered by: {trigger}</div>}
                      {doneWhen && <div>Complete when: {doneWhen}</div>}
                    </div>
                  )}
                  {phaseSteps.length === 0 ? (
                    <div className="py-2 pl-4">
                      <p className="text-[12px] text-ch/50">No tasks in this phase yet.</p>
                      {isAdmin && onCreateProjectStep && (
                        <button
                          type="button"
                          className="mt-2 text-[12px] text-gold hover:underline"
                          onClick={() =>
                            void onCreateProjectStep(phase.id, phase.name, Number(phase.expected_hrs) || 0)
                          }
                        >
                          + Add task from phase hours
                        </button>
                      )}
                      {isAdmin && onAssignToPhase && (
                        <div className="mt-3" id={`phase-assign-${phase.id}`}>
                          <StepAssigneeSection
                            stepId={`phase-${phase.id}`}
                            assignees={[]}
                            members={assigneeMembers}
                            principalName={assigneePrincipalName}
                            principalBurdenedRate={principalBurdenedRate}
                            isAdmin={isAdmin}
                            defaultExpanded
                            onUpsert={(payload) => onAssignToPhase(phase.id, phase.name, payload)}
                            onDelete={() => Promise.resolve()}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    phaseSteps.map((step) => {
                      const task: TaskRowData = {
                        id: step.id,
                        name: step.name?.trim() || step.description,
                        estimated_hrs: Number(step.estimated_hrs) || 0,
                        assigned_role: step.assigned_role ?? "principal",
                        trigger_description: step.trigger_description,
                        completion_criteria: step.completion_criteria,
                        steps: step.steps,
                        notes: step.notes,
                        completed_at: step.completed_at,
                        resources: resourcesByStep.get(step.id) ?? [],
                      };
                      const stepAssigneeList = assigneesByStep.get(step.id) ?? [];
                      return (
                        <div key={step.id} className="pl-2">
                          <TaskRow
                            task={task}
                            mode="project"
                            onToggleComplete={
                              onToggleStepComplete
                                ? (completed) => onToggleStepComplete(step.id, completed)
                                : undefined
                            }
                            onToggleStepItem={
                              onToggleStepItemComplete
                                ? (order, completed) => onToggleStepItemComplete(step.id, order, completed)
                                : undefined
                            }
                            onOpenResource={setPreviewResource}
                          />
                          {onUpsertStepAssignee && stepAssigneeList.length > 0 ? (
                            <div className="pb-2 pl-6">
                              <StepAssigneeSection
                                stepId={step.id}
                                assignees={stepAssigneeList}
                                members={assigneeMembers}
                                principalName={assigneePrincipalName}
                                principalBurdenedRate={principalBurdenedRate}
                                isAdmin={isAdmin}
                                onUpsert={(payload) => onUpsertStepAssignee(step.id, payload)}
                                onDelete={(aid) => onDeleteStepAssignee?.(aid) ?? Promise.resolve()}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  {isAdmin && onCreateProjectStep && phaseSteps.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 pl-4 text-[12px] text-gold hover:underline"
                      onClick={() => void onCreateProjectStep(phase.id, "New task", 0)}
                    >
                      + Add task
                    </button>
                  )}
                  {(() => {
                    const phaseStepIds = phaseSteps.map((s) => s.id);
                    const summary = sumPhaseAssigneeCost({
                      stepIds: phaseStepIds,
                      assigneesByStep,
                      members: assigneeMembers,
                      principalBurdenedRate,
                    });
                    const hasAssigneeHrs = summary.billable + summary.nonBillable > 0;
                    return (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-creamd/50 px-3 py-2">
                        <span className="text-[12px] text-ch/55">
                          {phaseSteps.length} tasks
                          {hasAssigneeHrs
                            ? ` · ${formatHours(summary.billable)} billable hrs · ${formatHours(summary.nonBillable)} non-billable hrs`
                            : ""}
                        </span>
                        <span className="text-[12px] font-medium text-ch">
                          {hasAssigneeHrs ? (
                            `Est. phase cost: ${fmtUsd(summary.cost, { decimals: 0 })}`
                          ) : isAdmin && onAssignToPhase && phaseSteps.length === 0 ? (
                            <button
                              type="button"
                              className="text-gold hover:underline"
                              onClick={() => {
                                document
                                  .getElementById(`phase-assign-${phase.id}`)
                                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                              }}
                            >
                              + Assign someone →
                            </button>
                          ) : (
                            "Assign team to see cost"
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
          </div>
        );
        })
      )}

      <p className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ch/50">Milestones</p>
      {milestones.length === 0 ? (
        <div className="text-[13px] text-ch/50">
          <p>No milestones added yet.</p>
          <p className="mt-1">Add one to see it on your capacity planner.</p>
          {isAdmin && onSaveMilestone && (
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!msLabel.trim() || !msDate) return;
                await onSaveMilestone(msLabel.trim(), msDate);
                setMsLabel("");
                setMsDate("");
              }}
            >
              <input
                className="rounded border border-border px-2 py-1 text-[13px]"
                placeholder="Milestone name"
                value={msLabel}
                onChange={(e) => setMsLabel(e.target.value)}
              />
              <input
                type="date"
                className="rounded border border-border px-2 py-1 text-[13px]"
                value={msDate}
                onChange={(e) => setMsDate(e.target.value)}
              />
              <button type="submit" className="text-[11px] font-medium text-gold">
                + Add milestone
              </button>
            </form>
          )}
        </div>
      ) : (
        <ul>
          {milestones.map((ms) => (
            <li key={ms.id} className="flex items-center gap-2.5 border-b border-border py-2.5">
              <span className="text-[10px]" style={{ color: CHARCOAL }}>
                ◆
              </span>
              <span className="flex-1 text-[13px] text-ch">{ms.label}</span>
              <span className="text-[12px] font-medium text-ch">
                {new Date(ms.milestone_date + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {isAdmin && onDeleteMilestone && (
                <button type="button" className="text-[11px] text-ch/40 hover:text-terra" onClick={() => onDeleteMilestone(ms.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  /* ─── TIME LOG SUB-VIEW ─── */
  const togglePerson = (id: string) => {
    setPersonFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const timelogView = (
    <div style={{ fontFamily: "Jost, sans-serif" }}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setPersonFilters(new Set());
            setBillableFilter(false);
            setNonBillableFilter(false);
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-[12px]",
            personFilters.size === 0 && !billableFilter && !nonBillableFilter
              ? "border-ch/30 bg-white text-ch"
              : "border-border bg-creamd/50 text-ch/60",
          )}
        >
          All
        </button>
        {projectTeamIds.map((m) => {
          const active = personFilters.has(m.id);
          const av = avatarStyle(m.id, team, principalId);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => togglePerson(m.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]",
                active ? "border-ch/30 bg-white text-ch" : "border-border bg-creamd/50 text-ch/60",
              )}
            >
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-medium"
                style={{ background: av.bg, color: av.color }}
              >
                {initials(m.name, m.email)}
              </span>
              {m.name || m.email.split("@")[0]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setBillableFilter((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-[12px]",
            billableFilter ? "border-[#b6dcc4] bg-[#edf7f1] text-[#1f6e3a]" : "border-border bg-creamd/50 text-ch/60",
          )}
        >
          Billable
        </button>
        <button
          type="button"
          onClick={() => setNonBillableFilter((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-[12px]",
            nonBillableFilter ? "border-[#f0d9a8] bg-[#fdf7ee] text-[#7a5c1e]" : "border-border bg-creamd/50 text-ch/60",
          )}
        >
          Non-billable
        </button>
      </div>

      <div className="mb-2 flex justify-between border-b border-border py-2.5 text-[12px] text-ch/60">
        <span>
          Total: {filteredEntries.length} entries · {formatHours(filteredEntries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hrs), 0))} billable hrs ·{" "}
          {formatHours(filteredEntries.filter((e) => !e.billable).reduce((s, e) => s + Number(e.hrs), 0))} non-billable hrs
        </span>
      </div>

      {groupedByDate.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ch/50">No time logged on this project yet.</p>
      ) : (
        groupedByDate.map(([date, dayEntries], i) => (
          <div key={date}>
            <p
              className={cn("text-[11px] font-medium uppercase tracking-wide text-ch/50", i > 0 ? "mt-3.5" : "")}
              style={{ marginBottom: 6 }}
            >
              {fmtDateShort(date)}
            </p>
            {dayEntries.map((e) => {
              const member = team.find((t) => t.id === e.user_id);
              const av = avatarStyle(e.user_id, team, principalId);
              return (
                <div
                  key={e.id}
                  className={cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-lg border bg-creamd/30 px-3.5 py-2.5",
                    !e.billable && "border-[#f0d9a8]",
                  )}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                    style={{ background: av.bg, color: av.color }}
                  >
                    {initials(member?.name ?? null, member?.email ?? "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-ch">{member?.name || member?.email || "—"}</div>
                    <div className="truncate text-[11px] text-ch/50">{e.description || "—"}</div>
                  </div>
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: e.billable ? SAGE : AMBER }}
                  />
                  <span className="shrink-0 text-[13px] font-medium tabular-nums text-ch">{formatHours(Number(e.hrs))}</span>
                  {e.start_time && (
                    <span className="shrink-0 text-[11px] text-ch/50">{e.start_time.slice(0, 5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3.5 border-t border-border pt-2.5 text-[11px] text-ch/50">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SAGE }} /> Billable
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} /> Non-billable
        </span>
        {projectTeamIds.map((m) => {
          const av = avatarStyle(m.id, team, principalId);
          return (
            <span key={m.id} className="inline-flex items-center gap-1">
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[8px] font-medium"
                style={{ background: av.bg, color: av.color }}
              >
                {initials(m.name, m.email)}
              </span>
              {m.name || m.email.split("@")[0]}
            </span>
          );
        })}
      </div>
    </div>
  );

  /* ─── AUDIT SUB-VIEW ─── */
  const auditView = (
    <div style={{ fontFamily: "Jost, sans-serif" }}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ch/50">Cost snapshot</p>
      {snapshot.is_retroactive && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-[12px]"
          style={{ background: "rgba(184,134,11,0.08)", borderColor: "rgba(184,134,11,0.25)", color: "#854F0B" }}
        >
          This snapshot was captured retroactively. It may not reflect your cost structure at the time this project was
          originally quoted.
        </div>
      )}
      <div className="text-[13px] text-ch">
        Snapshot captured {fmtDateLong(snapshot.snapshotted_at)}
      </div>
      <div className="mt-1 text-[11px] text-ch/50">
        Break-even ${Number(snapshot.break_even_rate).toFixed(2)}/hr · Aligned ${Number(snapshot.aligned_rate).toFixed(2)}
        /hr · Target margin {Number(snapshot.target_margin_pct)}%
      </div>

      {auditBySession.length > 0 ? (
        <div className="mt-4 space-y-3">
          {auditBySession.map(([key, rows]) => {
            const [changedAt, changedBy] = key.split("|");
            const who = team.find((t) => t.id === changedBy);
            const reason = rows.find((r) => r.reason)?.reason;
            return (
              <div key={key} className="border-b border-border pb-3">
                <div className="text-[13px] text-ch">
                  {new Date(changedAt).toLocaleString()} · Edited by {who?.email || who?.name || "Unknown"}
                </div>
                {reason && <div className="mt-1 text-[12px] italic text-ch/60">{reason}</div>}
                <ul className="mt-2 space-y-1">
                  {rows.map((r) => (
                    <li key={r.id} className="text-[11px] text-ch/50">
                      {formatAuditField(r.field_changed)} changed from {r.old_value ?? "—"} to{" "}
                      {r.new_value ?? "—"}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ch/50">No financial changes recorded yet.</p>
      )}

      {importLogs.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ch/50">Time imports</p>
          {importLogs.map((log) => {
            const count = entries.filter((e) => e.import_log_id === log.id).length;
            const range =
              log.date_range_start && log.date_range_end
                ? `${log.date_range_start} – ${log.date_range_end}`
                : null;
            return (
              <div key={log.id} className="border-b border-border py-2.5">
                <div className="text-[13px] text-ch">
                  {count || log.rows_imported} entries imported from {log.source} on {fmtDateLong(log.imported_at)}
                </div>
                {range && <div className="text-[11px] text-ch/50">{range}</div>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  const subTitles: Record<Exclude<ProjectSubView, null>, string> = {
    details: "Project details",
    scope: "Scope and milestones",
    timelog: "Time log",
    audit: "Audit history",
  };

  return activeSubView !== null ? (
    <>
      <SubViewShell title={subTitles[activeSubView]} onBack={() => setActiveSubView(null)}>
        {activeSubView === "details" && detailsView}
        {activeSubView === "scope" && scopeView}
        {activeSubView === "timelog" && timelogView}
        {activeSubView === "audit" && auditView}
      </SubViewShell>
      <ResourcePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />
    </>
  ) : (
    <div className={cn("rounded-lg border border-border bg-white p-[22px]", transitionClass)}>
      {primaryView}
    </div>
  );
}

export default ProjectDetailView;
