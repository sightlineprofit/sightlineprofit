import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyContext,
  updateFirm,
  listTeam,
  inviteTeamMember,
  listActivityGroups,
  addActivityGroup,
  deleteActivityGroup,
} from "@/lib/firm.functions";
import { ModulePage } from "@/components/shell/ModulePage";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sightline" }] }),
  component: SettingsPage,
});

const TABS = [
  { id: "firm", label: "Firm" },
  { id: "team", label: "Team" },
  { id: "activities", label: "Activity Groups" },
  { id: "billing", label: "Billing" },
  { id: "notifications", label: "Notifications" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-ch placeholder:text-ch/40 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20";
const btnCls =
  "inline-flex items-center justify-center rounded-md bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-goldl disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-ch transition-colors hover:bg-creamd";

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("firm");
  return (
    <ModulePage eyebrow="Studio" title="Settings" description="Configure your firm, team, and account.">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm transition-colors",
              tab === t.id
                ? "border-gold text-ch font-medium"
                : "border-transparent text-ch/60 hover:text-ch",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-8">
        {tab === "firm" && <FirmTab />}
        {tab === "team" && <TeamTab />}
        {tab === "activities" && <ActivityGroupsTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
      </div>
    </ModulePage>
  );
}

/* ─────────────── Firm ─────────────── */
function FirmTab() {
  const qc = useQueryClient();
  const getCtx = useServerFn(getMyContext);
  const upd = useServerFn(updateFirm);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const [name, setName] = useState(data?.firm?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upd({ data: { name } });
      toast.success("Firm updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-6 rounded-lg border border-border bg-white p-6">
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Firm name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Logo</label>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border bg-cream font-display text-2xl text-ch/40">
            {(name || "S").slice(0, 1).toUpperCase()}
          </div>
          <button type="button" className={ghostBtn} disabled>
            Upload (coming soon)
          </button>
        </div>
      </div>
      <button type="submit" className={btnCls} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

/* ─────────────── Team ─────────────── */
const ROLES = ["principal", "admin", "team", "view_only"] as const;
function TeamTab() {
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteTeamMember);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "team" as (typeof ROLES)[number],
    billable_rate: "",
    cost_rate: "",
    expected_hrs_per_week: "40",
    weeks_per_year: "48",
    billable_pct: "70",
  });

  const cost = Number(form.cost_rate) || 0;
  const hrs = Number(form.expected_hrs_per_week) || 0;
  const burdened = cost * hrs;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite({
        data: {
          name: form.name || null,
          email: form.email,
          role: form.role,
          billable_rate: form.billable_rate ? Number(form.billable_rate) : null,
          cost_rate: form.cost_rate ? Number(form.cost_rate) : null,
          expected_hrs_per_week: form.expected_hrs_per_week ? Number(form.expected_hrs_per_week) : null,
          weeks_per_year: form.weeks_per_year ? Number(form.weeks_per_year) : null,
          billable_pct: form.billable_pct ? Number(form.billable_pct) : null,
        },
      });
      toast.success("Invitation sent");
      setAdding(false);
      setForm({ ...form, name: "", email: "" });
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-xl">Team members</h3>
          <button type="button" onClick={() => setAdding((v) => !v)} className={btnCls}>
            {adding ? "Cancel" : "Add member"}
          </button>
        </div>
        {adding && (
          <form onSubmit={submit} className="grid grid-cols-2 gap-4 border-b border-border bg-cream/40 p-5">
            <Field label="Name">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputCls} required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ROLES)[number] })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Billable rate ($/hr)">
              <input type="number" min={0} step="1" className={inputCls} value={form.billable_rate} onChange={(e) => setForm({ ...form, billable_rate: e.target.value })} />
            </Field>
            <Field label="Cost rate ($/hr)">
              <input type="number" min={0} step="1" className={inputCls} value={form.cost_rate} onChange={(e) => setForm({ ...form, cost_rate: e.target.value })} />
            </Field>
            <Field label="Expected hrs / week">
              <input type="number" min={0} max={168} className={inputCls} value={form.expected_hrs_per_week} onChange={(e) => setForm({ ...form, expected_hrs_per_week: e.target.value })} />
            </Field>
            <Field label="Weeks / year">
              <input type="number" min={0} max={52} className={inputCls} value={form.weeks_per_year} onChange={(e) => setForm({ ...form, weeks_per_year: e.target.value })} />
            </Field>
            <Field label="Billable % of hours">
              <input type="number" min={0} max={100} className={inputCls} value={form.billable_pct} onChange={(e) => setForm({ ...form, billable_pct: e.target.value })} />
            </Field>
            <div className="col-span-2 flex items-center justify-between border-t border-border pt-4">
              <div className="text-sm text-ch/70">
                Fully burdened weekly cost:{" "}
                <span className="font-display text-xl text-ch">${burdened.toLocaleString()}</span>
              </div>
              <button type="submit" className={btnCls}>Send invitation</button>
            </div>
          </form>
        )}
        <div className="divide-y divide-border">
          {data?.members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-sm font-medium text-ch">{m.name || m.email}</div>
                <div className="text-xs text-ch/50">{m.email} · {m.role}</div>
              </div>
              <div className="text-xs text-ch/50">
                {m.billable_rate ? `$${m.billable_rate}/hr` : "—"}
              </div>
            </div>
          ))}
          {data?.invites?.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-5 py-3 bg-cream/40">
              <div>
                <div className="text-sm font-medium text-ch">{i.name || i.email}</div>
                <div className="text-xs text-ch/50">{i.email} · {i.role} · pending</div>
              </div>
              <div className="text-xs text-ch/50">Invited</div>
            </div>
          ))}
          {!data?.members?.length && !data?.invites?.length && (
            <div className="px-5 py-8 text-center text-sm text-ch/50">No team members yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────── Activity Groups ─────────────── */
const PRESET_COLORS = ["#B8860B", "#5C8A6E", "#C4714A", "#B85C5C", "#6B7AA1", "#8E6B9C", "#3F6F66", "#A07549"];
function ActivityGroupsTab() {
  const qc = useQueryClient();
  const list = useServerFn(listActivityGroups);
  const add = useServerFn(addActivityGroup);
  const del = useServerFn(deleteActivityGroup);
  const { data } = useQuery({ queryKey: ["activity_groups"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await add({ data: { name, color } });
      setName("");
      qc.invalidateQueries({ queryKey: ["activity_groups"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function remove(id: string) {
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["activity_groups"] });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="font-display text-xl">Add activity group</h3>
        <p className="mt-1 text-sm text-ch/60">Used across all time entries — design, admin, business development, etc.</p>
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">Color</label>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-7 w-7 rounded-full border-2 transition-transform", color === c ? "border-ch scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button type="submit" className={btnCls}>Add</button>
        </form>
      </div>
      <div className="rounded-lg border border-border bg-white">
        <div className="divide-y divide-border">
          {data?.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: g.color }} />
                <span className="text-sm text-ch">{g.name}</span>
              </div>
              <button onClick={() => remove(g.id)} className="text-ch/40 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!data?.length && (
            <div className="px-5 py-8 text-center text-sm text-ch/50">No activity groups yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Billing ─────────────── */
function BillingTab() {
  const getCtx = useServerFn(getMyContext);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const tier = data?.firm?.subscription_tier ?? "foundation";
  const status = data?.firm?.subscription_status ?? "trialing";
  const trialEnds = data?.firm?.trial_ends_at;
  const days = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Current plan</p>
            <h3 className="mt-1 font-display text-3xl tracking-tight capitalize">{tier}</h3>
            <p className="mt-1 text-sm text-ch/60 capitalize">{status} {status === "trialing" && `· ${days} days remaining`}</p>
          </div>
          <Link to="/billing" className={btnCls}>Manage subscription</Link>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-white p-6">
        <h3 className="font-display text-xl">Payment method</h3>
        <p className="mt-1 text-sm text-ch/60">No card on file. Add one to continue after your trial.</p>
        <Link to="/billing" className={`${ghostBtn} mt-4`}>Add billing details</Link>
      </div>
    </div>
  );
}

/* ─────────────── Notifications ─────────────── */
function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    weeklyDigest: true,
    targetAlerts: true,
    teamInvites: true,
    productUpdates: false,
  });
  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "weeklyDigest", label: "Weekly digest", desc: "Every Monday — how last week tracked against your targets." },
    { key: "targetAlerts", label: "Off-target alerts", desc: "When billable hours fall meaningfully below target." },
    { key: "teamInvites", label: "Team activity", desc: "New invites accepted, member changes." },
    { key: "productUpdates", label: "Product updates", desc: "New features, occasional and quiet." },
  ];
  return (
    <div className="max-w-2xl rounded-lg border border-border bg-white divide-y divide-border">
      {rows.map((r) => (
        <label key={r.key} className="flex items-start justify-between gap-6 p-5 cursor-pointer">
          <div>
            <div className="text-sm font-medium text-ch">{r.label}</div>
            <div className="text-xs text-ch/60 mt-0.5">{r.desc}</div>
          </div>
          <input
            type="checkbox"
            checked={prefs[r.key]}
            onChange={(e) => setPrefs({ ...prefs, [r.key]: e.target.checked })}
            className="mt-1 h-4 w-4 accent-gold"
          />
        </label>
      ))}
    </div>
  );
}