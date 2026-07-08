import { createFileRoute, redirect, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllFirms,
  listAllUsers,
  setFirmOverrides,
  setImpersonation,
  listWebhookLog,
  replayWebhook,
  recordWebhook,
  getAppSettings,
  updateAppSettings,
  listKbItemsAdmin,
  upsertKbItem,
  deleteKbItem,
} from "@/lib/admin.functions";
import {
  getDemoFirmStatus,
  enterDemoAsPrincipal,
  resetDemoFirm,
  loadDemoData,
} from "@/lib/demo.functions";
import { getMyContext } from "@/lib/firm.functions";
import { ModulePage } from "@/components/shell/ModulePage";
import { cn } from "@/lib/utils";
import { Shield, Eye, RotateCcw, Trash2, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Sightline" }] }),
  beforeLoad: async () => {
    // Soft check; server fns also enforce. Hard check happens on data load.
  },
  component: AdminPage,
});

type Tab = "firms" | "users" | "webhooks" | "kb" | "settings" | "demo";

function AdminPage() {
  const getCtx = useServerFn(getMyContext);
  const { data: ctx, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const [tab, setTab] = useState<Tab>("firms");

  if (isLoading) {
    return <ModulePage title="Admin"><p className="text-ch/60">Loading…</p></ModulePage>;
  }
  if (!ctx?.profile?.is_super_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "firms", label: "Firms" },
    { id: "users", label: "Users" },
    { id: "demo", label: "Demo" },
    { id: "webhooks", label: "Webhook Log" },
    { id: "kb", label: "Knowledge Base" },
    { id: "settings", label: "App Settings" },
  ];

  return (
    <ModulePage
      eyebrow="Sightline Internal"
      title="Admin"
      description="Cross-firm visibility, impersonation, and content management."
    >
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-gold text-ch font-medium"
                : "border-transparent text-ch/60 hover:text-ch",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "firms" && <FirmsTab impersonatedFirmId={ctx.profile.impersonated_firm_id} />}
      {tab === "users" && <UsersTab />}
      {tab === "demo" && <DemoTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "kb" && <KbTab />}
      {tab === "settings" && <SettingsTab />}
    </ModulePage>
  );
}

/* ============ Firms ============ */
function FirmsTab({ impersonatedFirmId }: { impersonatedFirmId: string | null }) {
  const qc = useQueryClient();
  const list = useServerFn(listAllFirms);
  const setOv = useServerFn(setFirmOverrides);
  const setImp = useServerFn(setImpersonation);
  const { data: firms = [] } = useQuery({ queryKey: ["admin-firms"], queryFn: () => list() });

  const overrideMut = useMutation({
    mutationFn: (p: any) => setOv({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-firms"] }),
  });
  const impMut = useMutation({
    mutationFn: (firm_id: string | null) => setImp({ data: { firm_id } }),
    onSuccess: () => {
      qc.invalidateQueries();
      window.location.reload();
    },
  });

  return (
    <div className="space-y-4">
      {impersonatedFirmId && (
        <div className="flex items-center justify-between rounded-md border border-gold/40 bg-goldp/40 px-4 py-2 text-sm">
          <span>Currently viewing as firm <code className="font-mono text-xs">{impersonatedFirmId}</code></span>
          <button
            type="button"
            onClick={() => impMut.mutate(null)}
            className="rounded-md bg-white px-3 py-1 text-xs hover:bg-creamd"
          >
            Stop impersonating
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-creamd/50 text-left text-[11px] uppercase tracking-wider text-ch/60">
            <tr>
              <th className="px-4 py-2">Firm</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Users</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Trial ends</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {firms.map((f: any) => (
              <tr key={f.id} className="hover:bg-creamd/30">
                <td className="px-4 py-2 font-medium">{f.name}</td>
                <td className="px-4 py-2 text-ch/70">{f.owner_email ?? "—"}</td>
                <td className="px-4 py-2 text-ch/70">{f.user_count}</td>
                <td className="px-4 py-2">
                  <select
                    value={f.subscription_tier}
                    onChange={(e) =>
                      overrideMut.mutate({ firm_id: f.id, subscription_tier: e.target.value })
                    }
                    className="rounded border border-border bg-white px-2 py-1 text-xs"
                  >
                    <option value="studio">Studio</option>
                    <option value="practice">Practice</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={f.subscription_status}
                    onChange={(e) =>
                      overrideMut.mutate({ firm_id: f.id, subscription_status: e.target.value })
                    }
                    className="rounded border border-border bg-white px-2 py-1 text-xs"
                  >
                    <option value="trialing">Trialing</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-xs text-ch/60">
                  {f.trial_ends_at ? new Date(f.trial_ends_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => impMut.mutate(f.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-creamd"
                  >
                    <Eye className="h-3 w-3" /> View as
                  </button>
                </td>
              </tr>
            ))}
            {firms.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ch/50">No firms yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Users ============ */
function UsersTab() {
  const list = useServerFn(listAllUsers);
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-creamd/50 text-left text-[11px] uppercase tracking-wider text-ch/60">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Firm</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Tier</th>
            <th className="px-4 py-2">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u: any) => (
            <tr key={u.id} className="hover:bg-creamd/30">
              <td className="px-4 py-2 font-medium">
                {u.name || "—"}
                {u.is_super_admin && (
                  <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase text-gold">
                    Super
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-ch/70">{u.email}</td>
              <td className="px-4 py-2 text-ch/70">{u.firm_name ?? "—"}</td>
              <td className="px-4 py-2 text-xs uppercase tracking-wider text-ch/60">{u.role}</td>
              <td className="px-4 py-2 text-xs uppercase text-ch/60">{u.firm_tier ?? "—"}</td>
              <td className="px-4 py-2 text-xs text-ch/60">
                {new Date(u.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Webhooks ============ */
function WebhooksTab() {
  const qc = useQueryClient();
  const list = useServerFn(listWebhookLog);
  const replay = useServerFn(replayWebhook);
  const record = useServerFn(recordWebhook);
  const { data: rows = [] } = useQuery({ queryKey: ["admin-webhooks"], queryFn: () => list() });
  const replayMut = useMutation({
    mutationFn: (id: string) => replay({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-webhooks"] }),
  });
  const testMut = useMutation({
    mutationFn: (tag: string) => record({ data: { event_tag: tag, payload: { test: true, at: new Date().toISOString() } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-webhooks"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          "principal-trial-start",
          "team-invite",
          "principal-trial-midpoint",
          "principal-trial-ending",
          "principal-converted",
        ].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => testMut.mutate(t)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs hover:bg-creamd"
          >
            Fire test: {t}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-creamd/50 text-left text-[11px] uppercase tracking-wider text-ch/60">
            <tr>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Firm</th>
              <th className="px-4 py-2">Recipient</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-creamd/30">
                <td className="px-4 py-2 font-mono text-xs">{r.event_tag}</td>
                <td className="px-4 py-2 text-ch/70">{r.firm_name ?? "—"}</td>
                <td className="px-4 py-2 text-ch/70">{r.recipient_email ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] uppercase",
                    r.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                    r.status === "pending" ? "bg-amber-100 text-amber-700" :
                    "bg-rose-100 text-rose-700",
                  )}>{r.status}</span>
                </td>
                <td className="px-4 py-2 text-xs text-ch/60">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => replayMut.mutate(r.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-creamd"
                  >
                    <RotateCcw className="h-3 w-3" /> Replay
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ch/50">No webhook events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ KB CMS ============ */
function KbTab() {
  const qc = useQueryClient();
  const list = useServerFn(listKbItemsAdmin);
  const upsert = useServerFn(upsertKbItem);
  const del = useServerFn(deleteKbItem);
  const { data: items = [] } = useQuery({ queryKey: ["admin-kb"], queryFn: () => list() });
  const [editing, setEditing] = useState<any | null>(null);

  const upsertMut = useMutation({
    mutationFn: (payload: any) => upsert({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kb"] });
      qc.invalidateQueries({ queryKey: ["kb-items"] });
      setEditing(null);
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-kb"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setEditing({
              type: "article",
              title: "",
              slug: "",
              category: "Getting started",
              summary: "",
              body: "",
              tags: [],
              tier_visibility: ["studio", "practice"],
              status: "draft",
              featured: false,
            })
          }
          className="inline-flex items-center gap-1 rounded-md bg-gold px-3 py-2 text-sm text-white hover:bg-gold/90"
        >
          <Plus className="h-4 w-4" /> New item
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-creamd/50 text-left text-[11px] uppercase tracking-wider text-ch/60">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Tiers</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it: any) => (
              <tr key={it.id} className="hover:bg-creamd/30">
                <td className="px-4 py-2 font-medium">
                  {it.title}
                  {it.featured && <span className="ml-2 text-xs text-gold">★</span>}
                </td>
                <td className="px-4 py-2 text-xs uppercase text-ch/60">{it.type}</td>
                <td className="px-4 py-2 text-ch/70">{it.category}</td>
                <td className="px-4 py-2 text-xs text-ch/60">{(it.tier_visibility ?? []).join(", ")}</td>
                <td className="px-4 py-2">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] uppercase",
                    it.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600",
                  )}>{it.status}</span>
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <button
                    type="button"
                    onClick={() => setEditing(it)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-creamd"
                  >Edit</button>
                  <button
                    type="button"
                    onClick={() => { if (confirm("Delete this item?")) delMut.mutate(it.id); }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                  ><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ch/50">No KB items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <KbEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => upsertMut.mutate(p)}
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}

function KbEditor({ item, onClose, onSave, saving }: { item: any; onClose: () => void; onSave: (p: any) => void; saving: boolean }) {
  const [f, setF] = useState<any>(item);
  const tiers: ("studio" | "practice")[] = ["studio", "practice"];
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200);
  function toggleTier(t: any) {
    setF((cur: any) => ({
      ...cur,
      tier_visibility: cur.tier_visibility.includes(t)
        ? cur.tier_visibility.filter((x: string) => x !== t)
        : [...cur.tier_visibility, t],
    }));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl">{item.id ? "Edit item" : "New item"}</h3>
          <button type="button" onClick={onClose} className="text-ch/60 hover:text-ch"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Title">
            <input
              className={inputCls}
              value={f.title}
              onChange={(e) => {
                const title = e.target.value;
                setF((cur: any) => ({
                  ...cur,
                  title,
                  slug: !cur.id && (!cur.slug || cur.slug === slugify(cur.title || "")) ? slugify(title) : cur.slug,
                }));
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slug">
              <input
                className={inputCls}
                value={f.slug}
                onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })}
                onBlur={() => setF((cur: any) => ({ ...cur, slug: cur.slug ? slugify(cur.slug) : slugify(cur.title || "") }))}
                placeholder="how-rates-work"
              />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="article">Article</option>
                <option value="video">Video</option>
              </select>
            </Field>
          </div>
          <Field label="Category">
            <input className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </Field>
          <Field label="Summary">
            <textarea className={inputCls} rows={2} value={f.summary ?? ""} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          </Field>
          {f.type === "article" ? (
            <Field label="Body (Markdown)">
              <textarea className={cn(inputCls, "font-mono text-xs")} rows={10} value={typeof f.body === "string" ? f.body : ""} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </Field>
          ) : (
            <Field label="Video URL (YouTube / Vimeo / mp4)">
              <input className={inputCls} value={f.video_url ?? ""} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
            </Field>
          )}
          <Field label="Tier visibility">
            <div className="flex gap-2">
              {tiers.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleTier(t)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs uppercase tracking-wider",
                    f.tier_visibility.includes(t)
                      ? "border-gold bg-goldp text-ch"
                      : "border-border bg-white text-ch/60",
                  )}
                >{t}</button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Featured">
              <label className="flex items-center gap-2 pt-2 text-sm">
                <input type="checkbox" checked={!!f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
                Pin to top
              </label>
            </Field>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ ...f, slug: f.slug ? slugify(f.slug) : slugify(f.title || "") })}
            className="rounded-md bg-gold px-4 py-2 text-sm text-white hover:bg-gold/90 disabled:opacity-50"
          >{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-gold focus:outline-none";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-ch/60">{label}</span>
      {children}
    </label>
  );
}

/* ============ App Settings ============ */
function SettingsTab() {
  const qc = useQueryClient();
  const get = useServerFn(getAppSettings);
  const upd = useServerFn(updateAppSettings);
  const { data: settings } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get() });
  const mut = useMutation({
    mutationFn: (p: any) => upd({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-settings"] }),
  });
  if (!settings) return <p className="text-ch/60">Loading…</p>;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Maintenance mode</p>
          <p className="text-xs text-ch/60">Show a maintenance banner across all firms.</p>
        </div>
        <button
          type="button"
          onClick={() => mut.mutate({ maintenance_mode: !settings.maintenance_mode })}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            settings.maintenance_mode ? "bg-gold" : "bg-stone-300",
          )}
        >
          <span className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            settings.maintenance_mode ? "translate-x-5" : "translate-x-0.5",
          )} />
        </button>
      </div>
    </div>
  );
}
/* ============ Demo Account ============ */
function DemoTab() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | "reset" | "load">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const getStatus = useServerFn(getDemoFirmStatus);
  const enter = useServerFn(enterDemoAsPrincipal);
  const reset = useServerFn(resetDemoFirm);
  const load = useServerFn(loadDemoData);

  const { data: firm, isLoading } = useQuery({
    queryKey: ["demo-firm"],
    queryFn: () => getStatus(),
  });

  async function runReset() {
    setBusy(true); setErr(null);
    try {
      await reset();
      await qc.invalidateQueries({ queryKey: ["demo-firm"] });
      setConfirm(null);
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setBusy(false); }
  }
  async function runLoad() {
    setBusy(true); setErr(null);
    try {
      await load();
      await qc.invalidateQueries({ queryKey: ["demo-firm"] });
      setConfirm(null);
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setBusy(false); }
  }
  async function viewAsPrincipal() {
    await enter();
    try { sessionStorage.removeItem("sightline.viewAs.v1"); } catch {}
    window.location.href = "/dashboard";
  }

  if (isLoading) return <p className="text-ch/60">Loading…</p>;
  if (!firm) {
    return (
      <div className="rounded-lg border border-border bg-white p-6 text-sm text-ch/70">
        Demo firm has not been provisioned yet. Contact engineering.
      </div>
    );
  }

  const isClean = firm.data_status === "clean";
  const lastReset = firm.last_reset_at
    ? new Date(firm.last_reset_at).toLocaleString()
    : "Never";
  const lastLoad = firm.last_demo_loaded_at
    ? new Date(firm.last_demo_loaded_at).toLocaleString()
    : "Never loaded";

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28 }}>
          Demo Account
        </h2>
        <p
          className="text-ch/60"
          style={{ fontFamily: "Jost, system-ui, sans-serif", fontSize: 13, fontWeight: 300 }}
        >
          Manage the demo firm used for testing and demonstrations.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-ch/50">Firm</div>
            <div className="font-medium">{firm.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-ch/50">Tier</div>
            <div className="font-medium">Practice</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-ch/50">Data status</div>
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                isClean
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-goldp text-ch",
              )}
            >
              {isClean ? "Clean" : "Has demo data"}
            </span>
          </div>
        </div>
        <div className="flex gap-6 text-xs text-ch/60 pt-2 border-t border-border">
          <div>Last reset: <span className="text-ch/80">{lastReset}</span></div>
          <div>Last demo data loaded: <span className="text-ch/80">{lastLoad}</span></div>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={viewAsPrincipal}
          className="rounded-md bg-ch px-4 py-2 text-sm text-white hover:opacity-90"
        >
          View demo as principal →
        </button>
        <button
          type="button"
          onClick={() => setConfirm("reset")}
          className="rounded-md border border-border bg-white px-4 py-2 text-sm text-ch hover:bg-creamd"
        >
          Reset to clean state
        </button>
        <button
          type="button"
          onClick={() => setConfirm("load")}
          className="rounded-md bg-gold px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Load demo data
        </button>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
          onClick={() => !busy && setConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-medium">
              {confirm === "reset" ? "Reset demo firm?" : "Load demo data?"}
            </h3>
            <p className="mb-4 text-sm text-ch/70">
              {confirm === "reset"
                ? "This will permanently delete all data in Aldrich Studio — Demo and return it to a clean onboarding state. This cannot be undone."
                : "This will populate Aldrich Studio — Demo with realistic sample data so you can demonstrate all features. Any existing demo data will be replaced."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="rounded-md border border-border bg-white px-4 py-2 text-sm hover:bg-creamd"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirm === "reset" ? runReset : runLoad}
                className={cn(
                  "rounded-md px-4 py-2 text-sm text-white disabled:opacity-60",
                  confirm === "reset" ? "bg-[#B85C5C]" : "bg-gold",
                )}
              >
                {busy
                  ? "Working…"
                  : confirm === "reset"
                  ? "Reset demo firm"
                  : "Load demo data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
