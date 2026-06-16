import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { listAllFirms, setImpersonation } from "@/lib/admin.functions";
import {
  useViewAs,
  type ViewAsRole,
  type ViewAsTier,
} from "@/lib/view-as";

type Props = {
  realIsSuper: boolean;
  realImpersonating: boolean;
};

const ROLES: { value: ViewAsRole; label: string }[] = [
  { value: "principal", label: "Principal" },
  { value: "admin", label: "Admin" },
  { value: "team", label: "Team" },
  { value: "view_only", label: "View Only" },
];

const TIERS: { value: ViewAsTier; label: string }[] = [
  { value: "foundation", label: "Foundation" },
  { value: "studio", label: "Studio" },
  { value: "practice", label: "Practice" },
];

const PRESETS: {
  label: string;
  role: ViewAsRole;
  tier: ViewAsTier;
}[] = [
  { label: "New Foundation owner", role: "principal", tier: "foundation" },
  { label: "Studio with team", role: "team", tier: "studio" },
  { label: "Practice admin", role: "admin", tier: "practice" },
  { label: "View only", role: "view_only", tier: "practice" },
];

const GOLD = "#C59845";
const DARK = "#2C2C2C";
const CREAM = "#F5F0E8";

export function ViewSwitcher({ realIsSuper, realImpersonating }: Props) {
  const [open, setOpen] = useState(false);
  const va = useViewAs();
  const qc = useQueryClient();
  const listFirms = useServerFn(listAllFirms);
  const setImpFn = useServerFn(setImpersonation);

  const firmsQuery = useQuery({
    queryKey: ["admin", "firms-mini"],
    queryFn: () => listFirms(),
    enabled: open && realIsSuper && !realImpersonating,
  });

  // Only super admins (not currently in real DB-impersonation mode) get the
  // switcher; impersonation banner owns that flow.
  if (!realIsSuper || realImpersonating) return null;

  const overrideActive = va.isActive;

  async function setFirm(firmId: string | null) {
    va.setFirmId(firmId);
    // Reuse DB-backed impersonation so all server fns scope to that firm.
    await setImpFn({ data: { firm_id: firmId } });
    await qc.invalidateQueries();
  }

  async function exitAll() {
    va.clearAll();
    await setImpFn({ data: { firm_id: null } });
    await qc.invalidateQueries();
  }

  const roleLabel = va.role
    ? ROLES.find((r) => r.value === va.role)?.label.toUpperCase()
    : null;
  const tierLabel = va.tier ? va.tier.toUpperCase() : null;

  const pillBase: React.CSSProperties = {
    position: "fixed",
    bottom: 16,
    left: 16,
    fontFamily: "Jost, system-ui, sans-serif",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    padding: "4px 10px",
    borderRadius: 2,
    cursor: "pointer",
    border: "none",
    zIndex: 9999,
  };

  return (
    <>
      {/* Override banner */}
      {overrideActive && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10000,
            width: "100%",
            background: GOLD,
            color: DARK,
            padding: "6px 16px",
            fontFamily: "Jost, system-ui, sans-serif",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Viewing as: {roleLabel ?? "—"}
            {tierLabel ? ` · ${tierLabel}` : ""}
            {va.firmId && firmsQuery.data
              ? ` · ${firmsQuery.data.find((f) => f.id === va.firmId)?.name ?? "firm"}`
              : ""}
          </span>
          <button
            type="button"
            onClick={exitAll}
            style={{
              background: "transparent",
              border: "none",
              color: DARK,
              cursor: "pointer",
              fontWeight: 600,
              letterSpacing: "0.1em",
              fontSize: 10,
            }}
          >
            Exit override ×
          </button>
        </div>
      )}

      {/* Pill trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...pillBase,
          background: overrideActive ? GOLD : DARK,
          color: overrideActive ? DARK : GOLD,
        }}
      >
        {overrideActive
          ? `● Viewing as ${roleLabel ?? "—"}${tierLabel ? ` · ${tierLabel}` : ""}`
          : "Super Admin"}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 48,
            left: 16,
            width: 280,
            background: DARK,
            border: "1px solid rgba(197,152,69,0.3)",
            borderRadius: 4,
            padding: 16,
            zIndex: 9998,
            color: CREAM,
            fontFamily: "Jost, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 16,
                color: CREAM,
              }}
            >
              View as
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <SectionLabel>Role</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              marginBottom: 12,
            }}
          >
            {ROLES.map((r) => (
              <ToggleButton
                key={r.value}
                active={va.role === r.value}
                onClick={() =>
                  va.setRole(va.role === r.value ? null : r.value)
                }
              >
                {r.label}
              </ToggleButton>
            ))}
          </div>

          <SectionLabel>Tier</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 4,
              marginBottom: 12,
            }}
          >
            {TIERS.map((t) => (
              <ToggleButton
                key={t.value}
                active={va.tier === t.value}
                onClick={() =>
                  va.setTier(va.tier === t.value ? null : t.value)
                }
              >
                {t.label}
              </ToggleButton>
            ))}
          </div>

          <SectionLabel>Firm Data</SectionLabel>
          <select
            value={va.firmId ?? ""}
            onChange={(e) => setFirm(e.target.value || null)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 2,
              padding: "6px 8px",
              fontFamily: "Jost, system-ui, sans-serif",
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            <option value="">My test firm (default)</option>
            {(firmsQuery.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <SectionLabel>Quick Presets</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => va.setAll({ role: p.role, tier: p.tier })}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.6)",
                  padding: "7px 10px",
                  borderRadius: 2,
                  fontFamily: "Jost, system-ui, sans-serif",
                  fontSize: 10,
                  fontWeight: 400,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          {overrideActive && (
            <button
              type="button"
              onClick={exitAll}
              style={{
                width: "100%",
                background: "rgba(197,152,69,0.15)",
                color: GOLD,
                border: "none",
                borderRadius: 2,
                padding: 8,
                fontFamily: "Jost, system-ui, sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Exit view override
            </button>
          )}
        </div>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "Jost, system-ui, sans-serif",
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? GOLD : "rgba(255,255,255,0.06)",
        color: active ? DARK : "rgba(255,255,255,0.6)",
        fontWeight: active ? 600 : 500,
        border: "none",
        borderRadius: 2,
        padding: "6px 0",
        fontFamily: "Jost, system-ui, sans-serif",
        fontSize: 10,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}