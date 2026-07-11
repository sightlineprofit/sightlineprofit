import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getFirmPreferences,
  setTourStep,
  skipTourFn,
  completeTourFn,
  resetTourFn,
  reconcileTour,
  dismissTourWelcomeBanner,
} from "@/lib/tour.functions";
import { upsertFirmConfig, addExpense, upsertOwnerCompensation } from "@/lib/firm.functions";
import { getDashboardData } from "@/lib/dashboard.functions";
import { getMyContext } from "@/lib/firm.functions";
import { supabase } from "@/integrations/supabase/client";

type TourPrefs = {
  tour_completed: boolean;
  tour_step: number;
  tour_skipped_at: string | null;
  welcome_banner_dismissed: boolean;
} | null;

type TourCtx = {
  prefs: TourPrefs;
  isOpen: boolean;
  currentStep: number; // 1..7
  startTour: () => void;
  resumeTour: () => void;
  skipTour: () => Promise<void>;
  nextStep: () => Promise<void>;
  previousStep: () => void;
  completeTour: () => Promise<void>;
  resetTour: () => Promise<void>;
  refetch: () => void;
};

const Ctx = createContext<TourCtx | null>(null);

export function useTour() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTour must be used within TourProvider");
  return c;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const getPrefs = useServerFn(getFirmPreferences);
  const setStep = useServerFn(setTourStep);
  const skipFn = useServerFn(skipTourFn);
  const completeFn = useServerFn(completeTourFn);
  const resetFn = useServerFn(resetTourFn);
  const reconcileFn = useServerFn(reconcileTour);
  const dismissBannerFn = useServerFn(dismissTourWelcomeBanner);
  const location = useLocation();
  const navigate = useNavigate();

  const { data: prefs, refetch } = useQuery<TourPrefs>({
    queryKey: ["firm-preferences"],
    queryFn: async () => (await getPrefs()) as TourPrefs,
    staleTime: 30_000,
  });

  const [isOpen, setOpen] = useState(false);
  const [currentStep, setCurrent] = useState(1);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const autoLaunchedRef = useRef(false);
  const reconciledRef = useRef(false);

  // Run reconciliation once per session, before any auto-launch decision.
  useEffect(() => {
    if (reconciledRef.current) return;
    if (!prefs) return;
    if (prefs.tour_completed) { reconciledRef.current = true; return; }
    reconciledRef.current = true;
    (async () => {
      try {
        await reconcileFn();
      } catch (e) {
        console.warn("reconcileTour failed", e);
      } finally {
        await refetch();
      }
    })();
  }, [prefs, reconcileFn, refetch]);

  // Auto-launch on dashboard 1.5s after load if fresh state
  useEffect(() => {
    if (!prefs) return;
    if (autoLaunchedRef.current) return;
    if (location.pathname !== "/dashboard") return;
    if (prefs.tour_completed) return;
    if (prefs.tour_skipped_at) return;
    if (prefs.tour_step !== 0) return; // mid-tour users only see resume prompt
    autoLaunchedRef.current = true;
    const t = setTimeout(() => {
      setCurrent(1);
      setOpen(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [prefs, location.pathname]);

  const startTour = useCallback(() => {
    const resumeAt = Math.min(7, Math.max(1, (prefs?.tour_step ?? 0) + 1));
    setCurrent(resumeAt);
    setOpen(true);
    if (location.pathname !== "/dashboard") navigate({ to: "/dashboard" });
  }, [prefs, location.pathname, navigate]);

  const resumeTour = useCallback(() => {
    const next = Math.min(7, Math.max(1, (prefs?.tour_step ?? 0) + 1));
    setCurrent(next);
    setOpen(true);
    if (location.pathname !== "/dashboard") navigate({ to: "/dashboard" });
  }, [prefs, location.pathname, navigate]);

  const nextStep = useCallback(async () => {
    const completed = currentStep;
    try {
      await setStep({ data: { step: completed } });
    } catch (e) {
      // still advance UI
      console.warn("setTourStep failed", e);
    }
    await refetch();
    if (currentStep >= 7) {
      await completeFn();
      qc.invalidateQueries({ queryKey: ["firm-preferences"] });
      setOpen(false);
      return;
    }
    // Step 4 → Step 5: ensure we're on /dashboard with rate visible before spotlighting.
    if (currentStep === 4) {
      if (location.pathname !== "/dashboard") {
        await navigate({ to: "/dashboard" });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    // Step 6 → Step 7: Step 7 spotlights the time calendar.
    if (currentStep === 6) {
      if (location.pathname !== "/time-calendar") {
        await navigate({ to: "/time-calendar" });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    setCurrent((s) => Math.min(7, s + 1));
  }, [currentStep, setStep, refetch, completeFn, qc, location.pathname, navigate]);

  const previousStep = useCallback(() => {
    setCurrent((s) => Math.max(1, s - 1));
  }, []);

  const performSkip = useCallback(async () => {
    try {
      await skipFn();
    } finally {
      qc.invalidateQueries({ queryKey: ["firm-preferences"] });
      setOpen(false);
      setSkipConfirmOpen(false);
    }
  }, [skipFn, qc]);

  // Split skip behavior: confirm only when skipping before Step 3 is complete.
  const skipTour = useCallback(async () => {
    if (currentStep < 3) {
      setSkipConfirmOpen(true);
      return;
    }
    await performSkip();
  }, [currentStep, performSkip]);

  const completeTour = useCallback(async () => {
    try {
      await completeFn();
    } finally {
      qc.invalidateQueries({ queryKey: ["firm-preferences"] });
      setOpen(false);
    }
  }, [completeFn, qc]);

  const resetTour = useCallback(async () => {
    await resetFn();
    await refetch();
    autoLaunchedRef.current = false;
    reconciledRef.current = false;
    qc.invalidateQueries({ queryKey: ["firm-preferences"] });
  }, [resetFn, refetch, qc]);

  const value = useMemo<TourCtx>(
    () => ({ prefs: prefs ?? null, isOpen, currentStep, startTour, resumeTour, skipTour, nextStep, previousStep, completeTour, resetTour, refetch }),
    [prefs, isOpen, currentStep, startTour, resumeTour, skipTour, nextStep, previousStep, completeTour, resetTour, refetch],
  );

  const showCompletionBanner =
    !!prefs &&
    prefs.tour_completed &&
    !prefs.welcome_banner_dismissed &&
    !prefs.tour_skipped_at &&
    location.pathname === "/dashboard";

  return (
    <Ctx.Provider value={value}>
      {children}
      {typeof document !== "undefined" && isOpen ? createPortal(<TourOverlay />, document.body) : null}
      {typeof document !== "undefined" && !isOpen && prefs && !prefs.tour_completed && prefs.tour_step > 0
        ? createPortal(<ResumePrompt onClick={resumeTour} step={prefs.tour_step} />, document.body)
        : null}
      {typeof document !== "undefined" && skipConfirmOpen
        ? createPortal(
            <SkipConfirm
              onCancel={() => setSkipConfirmOpen(false)}
              onConfirm={performSkip}
            />,
            document.body,
          )
        : null}
      {typeof document !== "undefined" && showCompletionBanner
        ? createPortal(
            <CompletionBanner
              onDismiss={async () => {
                try { await dismissBannerFn(); } finally { qc.invalidateQueries({ queryKey: ["firm-preferences"] }); }
              }}
            />,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

/* ─────────────────────────── Overlay ─────────────────────────── */

function TourOverlay() {
  const { currentStep, previousStep, nextStep, skipTour, completeTour } = useTour();
  const isMobile = useIsMobile();
  const location = useLocation();
  // While the project setup wizard is auto-opening on /sightline, keep the
  // tour mounted (so realtime listeners for `projects` / `project_phases`
  // keep firing) but hide it visually so the wizard is fully usable. The
  // Sightline route strips `?new=1` from the URL when the wizard closes.
  const suppressed =
    location.pathname === "/sightline" &&
    (location.search as Record<string, unknown> | undefined)?.new != null &&
    String((location.search as Record<string, unknown>).new) !== "";

  const cardStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#FAF7F2",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 32px rgba(44,44,44,0.18)",
        padding: "20px 20px 32px",
        maxHeight: "75vh",
        overflowY: "auto",
        fontFamily: "Jost, system-ui, sans-serif",
        animation: "tourSlideUp 320ms cubic-bezier(0.32, 0.72, 0, 1)",
      }
    : {
        background: "#FAF7F2",
        borderRadius: 10,
        boxShadow: "0 8px 40px rgba(44,44,44,0.2)",
        padding: 28,
        width: 420,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "90vh",
        overflowY: "auto",
        fontFamily: "Jost, system-ui, sans-serif",
      };

  const wrapStyle: React.CSSProperties = isMobile
    ? { position: "fixed", inset: 0, background: "rgba(44,44,44,0.65)", zIndex: 1000 }
    : {
        position: "fixed",
        inset: 0,
        background: "rgba(44,44,44,0.60)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      };

  return (
    <div
      style={{
        ...wrapStyle,
        ...(suppressed
          ? { background: "transparent", pointerEvents: "none", visibility: "hidden" as const }
          : null),
      }}
      aria-hidden={suppressed || undefined}
    >
      <style>{`@keyframes tourSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes tourPulseGold { 0% { box-shadow: 0 0 0 0 rgba(184,134,11,0.4);} 100% { box-shadow: 0 0 0 8px rgba(184,134,11,0);} }`}</style>
      <div style={cardStyle}>
        {isMobile ? (
          <div style={{ width: 36, height: 4, background: "rgba(44,44,44,0.15)", borderRadius: 2, margin: "0 auto 16px" }} />
        ) : null}
        <StepHeader step={currentStep} />
        <StepBody
          step={currentStep}
          onAdvance={nextStep}
          onBack={previousStep}
          onSkip={skipTour}
          onComplete={completeTour}
        />
      </div>
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#8A7F75" }}>
        Step {step} of 7
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => {
          const done = n < step;
          const current = n === step;
          return (
            <span
              key={n}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: done ? "#B8860B" : current ? "#2C2C2C" : "transparent",
                border: done ? "1.5px solid #B8860B" : "1.5px solid rgba(44,44,44,0.2)",
                boxShadow: current ? "0 0 0 2px #B8860B" : "none",
                display: "inline-block",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return mobile;
}

/* ─────────────────────────── Shared UI ─────────────────────────── */

const titleStyle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 24,
  fontWeight: 400,
  color: "#2C2C2C",
  lineHeight: 1.2,
  marginTop: 12,
  marginBottom: 8,
};
const bodyStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#6B6259",
  lineHeight: 1.75,
  marginBottom: 20,
  whiteSpace: "pre-line",
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "#2C2C2C", marginBottom: 4, display: "block" };
const inputStyle: React.CSSProperties = {
  border: "0.5px solid rgba(44,44,44,0.18)",
  borderRadius: 4,
  padding: "10px 12px",
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "white",
};
const helperStyle: React.CSSProperties = { fontSize: 11, color: "#8A7F75", marginTop: 3 };
const primaryBtn: React.CSSProperties = {
  padding: "9px 22px",
  background: "#2C2C2C",
  color: "#FAF7F2",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  border: "none",
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "9px 18px",
  border: "0.5px solid rgba(44,44,44,0.18)",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  color: "#2C2C2C",
  background: "transparent",
  cursor: "pointer",
};

function NavRow({
  step,
  onBack,
  onSkip,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  step: number;
  onBack?: () => void;
  onSkip: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  // Back only on steps 2, 3, 4 (data-entry). Never on 1 (first) or 5/6/7 (orientation).
  const showBack = step === 2 || step === 3 || step === 4;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
      <button
        type="button"
        onClick={onSkip}
        style={{ fontSize: 12, color: "#8A7F75", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
      >
        Skip tour
      </button>
      <div style={{ display: "flex", gap: 8 }}>
        {showBack && onBack ? (
          <button type="button" onClick={onBack} style={ghostBtn}>
            Back
          </button>
        ) : null}
        <button type="button" onClick={onNext} disabled={nextDisabled} style={{ ...primaryBtn, opacity: nextDisabled ? 0.5 : 1 }}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Steps ─────────────────────────── */

function StepBody({
  step,
  onAdvance,
  onBack,
  onSkip,
  onComplete,
}: {
  step: number;
  onAdvance: () => Promise<void>;
  onBack: () => void;
  onSkip: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const skip = () => { void onSkip(); };
  switch (step) {
    case 1:
      return <Step1Compensation onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 2:
      return <Step2Expenses onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 3:
      return <Step3Capacity onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 4:
      return <Step4Team onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 5:
      return <Step5RateOrientation onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 6:
      return <Step6Project onAdvance={onAdvance} onBack={onBack} onSkip={skip} />;
    case 7:
      return <Step7TimeEntry onComplete={onComplete} onBack={onBack} onSkip={skip} />;
    default:
      return null;
  }
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Step1Compensation({ onAdvance, onBack, onSkip }: { onAdvance: () => Promise<void>; onBack: () => void; onSkip: () => void }) {
  const [salary, setSalary] = useState<string>("");
  const [distributions, setDistributions] = useState<string>("");
  const [health, setHealth] = useState<string>("");
  const [retire, setRetire] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertFirmConfig);
  const upsertOwnerComp = useServerFn(upsertOwnerCompensation);

  const total = (Number(salary) || 0) + (Number(distributions) || 0) + (Number(health) || 0) + (Number(retire) || 0);

  const save = async () => {
    setErr(null);
    const s = Number(salary) || 0;
    const d = Number(distributions) || 0;
    if (s <= 0 && d <= 0) {
      setErr("Enter at least your salary or distributions to continue.");
      return;
    }
    setSaving(true);
    try {
      await upsert({
        data: {
          comp_draw_annual: s,
          comp_distribution_annual: d,
          comp_health_annual: Number(health) || 0,
          comp_retire_annual: Number(retire) || 0,
        },
      });
      // Also persist to owner_compensation so Settings → Compensation and
      // finance.calc() (which prefers owner_compensation rows over
      // firm_config when any exist) see the same values entered here.
      try {
        await upsertOwnerComp({
          data: {
            comp_draw_annual: s,
            distribution_annual: d,
            health_insurance_annual: Number(health) || 0,
            retirement_annual: Number(retire) || 0,
          },
        });
      } catch (ownerErr) {
        // Non-fatal: firm_config still holds the values for the aligned rate.
        console.warn("upsertOwnerCompensation from tour failed", ownerErr);
      }
      await onAdvance();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 style={titleStyle}>What do you need to pay yourself?</h2>
      <p style={bodyStyle}>
        This is the foundation your rate is built from. Enter what you want the business to cover — your salary, owner distributions, taxes, health insurance, and retirement contributions.
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={labelStyle}>W-2 salary (annual)</label>
          <input style={inputStyle} inputMode="numeric" placeholder="$60,000" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>What you pay yourself on payroll before taxes</div>
        </div>
        <div>
          <label style={labelStyle}>Owner distributions (annual)</label>
          <input style={inputStyle} inputMode="numeric" placeholder="$60,000" value={distributions} onChange={(e) => setDistributions(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>Lower-taxed draw on top of salary — common for S-corps</div>
        </div>
        <div>
          <label style={labelStyle}>Health insurance (annual)</label>
          <input style={inputStyle} inputMode="numeric" placeholder="$5,000" value={health} onChange={(e) => setHealth(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>The firm's contribution to your health coverage</div>
        </div>
        <div>
          <label style={labelStyle}>Retirement (annual)</label>
          <input style={inputStyle} inputMode="numeric" placeholder="$7,500" value={retire} onChange={(e) => setRetire(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>IRA, SEP, or 401k contributions by the firm</div>
        </div>
      </div>
      <div style={{ background: "rgba(184,134,11,0.07)", border: "0.5px solid rgba(184,134,11,0.2)", borderRadius: 6, padding: "12px 14px", marginTop: 16 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2C2C2C" }}>
          Total compensation: {usd(total)}
        </div>
      </div>
      {err ? <div style={{ color: "#B23B3B", fontSize: 12, marginTop: 10 }}>{err}</div> : null}
      <NavRow step={1} onBack={onBack} onSkip={onSkip} onNext={save} nextLabel={saving ? "Saving…" : "Save & continue →"} nextDisabled={saving} />
    </>
  );
}

type ExpRow = { name: string; amount: string; frequency: "monthly" | "quarterly" | "annual" };

function Step2Expenses({ onAdvance, onBack, onSkip }: { onAdvance: () => Promise<void>; onBack: () => void; onSkip: () => void }) {
  const [rows, setRows] = useState<ExpRow[]>([
    { name: "", amount: "", frequency: "monthly" },
    { name: "", amount: "", frequency: "monthly" },
  ]);
  const [saving, setSaving] = useState(false);
  const add = useServerFn(addExpense);

  const toAnnual = (r: ExpRow) => {
    const a = Number(r.amount) || 0;
    return r.frequency === "monthly" ? a * 12 : r.frequency === "quarterly" ? a * 4 : a;
  };
  const total = rows.reduce((sum, r) => sum + toAnnual(r), 0);

  const update = (i: number, patch: Partial<ExpRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        const amount = Number(r.amount);
        if (!r.name.trim() || !amount) continue;
        await add({
          data: {
            name: r.name.trim(),
            amount,
            frequency: r.frequency,
            recurring: true,
            category: null,
          },
        });
      }
      await onAdvance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save expenses");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 style={titleStyle}>What does it cost to run the firm?</h2>
      <p style={bodyStyle}>
        Software, insurance, subscriptions, rent. These fixed costs run whether you bill ten hours this week or forty. Add what you know — you can update these anytime and your rate recalculates immediately.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 110px", gap: 6 }}>
            <input style={inputStyle} placeholder="e.g. Software" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <input style={inputStyle} inputMode="numeric" placeholder="$0" value={r.amount} onChange={(e) => update(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} />
            <select style={{ ...inputStyle, padding: "10px 8px" }} value={r.frequency} onChange={(e) => update(i, { frequency: e.target.value as ExpRow["frequency"] })}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annually</option>
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, { name: "", amount: "", frequency: "monthly" }])}
        style={{ fontSize: 12, color: "#B8860B", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 10 }}
      >
        + Add expense
      </button>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2C", marginTop: 12 }}>Annual expenses: {usd(total)}</div>
      <NavRow step={2} onBack={onBack} onSkip={onSkip} onNext={save} nextLabel={saving ? "Saving…" : "Save & continue →"} nextDisabled={saving} />
    </>
  );
}

function Step3Capacity({ onAdvance, onBack, onSkip }: { onAdvance: () => Promise<void>; onBack: () => void; onSkip: () => void }) {
  const [hrs, setHrs] = useState("");
  const [weeks, setWeeks] = useState("48");
  const [rate, setRate] = useState("");
  const [margin, setMargin] = useState("40");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const upsert = useServerFn(upsertFirmConfig);
  const qc = useQueryClient();
  const fetchDashDirect = useServerFn(getDashboardData);

  // Load current comp+expenses via dashboard fetch to preview aligned rate
  const fetchDash = useServerFn(getDashboardData);
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });

  const preview = useMemo(() => {
    const h = Number(hrs) || 0;
    const w = Number(weeks) || 0;
    const m = Number(margin) || 0;
    const cfg: any = dash?.config ?? {};
    const comp = (Number(cfg.comp_draw_annual) || 0) + (Number(cfg.comp_distribution_annual) || 0) + (Number(cfg.comp_health_annual) || 0) + (Number(cfg.comp_retire_annual) || 0);
    const exp = (dash?.expenses ?? []).reduce((s: number, e: any) => {
      const a = Number(e.amount) || 0;
      return s + (e.frequency === "monthly" ? a * 12 : e.frequency === "quarterly" ? a * 4 : a);
    }, 0);
    const totalCost = comp + exp;
    if (!h || !w) return null;
    const breakEven = totalCost / (h * w);
    const aligned = m < 100 ? breakEven / (1 - m / 100) : breakEven;
    return { breakEven, aligned, totalCost };
  }, [hrs, weeks, margin, dash]);

  const save = async () => {
    setErr(null);
    const h = Number(hrs);
    const w = Number(weeks);
    const r = Number(rate);
    const m = Number(margin);
    if (!h || !w || !r || !m) {
      setErr("All four fields are required.");
      return;
    }
    setSaving(true);
    try {
      await upsert({
        data: {
          target_billable_hrs_per_week: h,
          available_hrs_per_week: h,
          rate_billed: r,
          target_gross_margin_pct: m,
        },
      });
      // Race condition fix: wait for aligned rate to recalculate before Step 5.
      setCalculating(true);
      const start = Date.now();
      // Poll dashboard config until rate_billed is present, capped at 3s.
      while (Date.now() - start < 3000) {
        try {
          const fresh: any = await fetchDashDirect();
          if (Number(fresh?.config?.rate_billed) > 0 && Number(fresh?.config?.target_billable_hrs_per_week) > 0) {
            break;
          }
        } catch { /* keep polling */ }
        await new Promise((r2) => setTimeout(r2, 300));
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      await onAdvance();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
      setCalculating(false);
    }
  };

  return (
    <>
      <h2 style={titleStyle}>How many hours do you bill?</h2>
      <p style={bodyStyle}>
        Your costs are divided across your billable hours — this is the key number most designers overlook. Enter your capacity and watch your aligned rate appear in real time below.
      </p>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label style={labelStyle}>Target billable hrs/week</label>
          <input style={inputStyle} inputMode="numeric" placeholder="25" value={hrs} onChange={(e) => setHrs(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>Hours billed to clients each week</div>
        </div>
        <div>
          <label style={labelStyle}>Working weeks per year</label>
          <input style={inputStyle} inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>Most firms work 46–48 weeks</div>
        </div>
        <div>
          <label style={labelStyle}>Your current billed rate</label>
          <input style={inputStyle} inputMode="numeric" placeholder="$225" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>What you charge clients per hour</div>
        </div>
        <div>
          <label style={labelStyle}>Target profit margin</label>
          <input style={inputStyle} inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div style={helperStyle}>Profit % on each dollar billed</div>
        </div>
      </div>
      <div style={{ background: "rgba(184,134,11,0.07)", border: "0.5px solid rgba(184,134,11,0.2)", borderRadius: 6, padding: "12px 14px", marginTop: 16 }}>
        {preview && preview.totalCost > 0 ? (
          <>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, color: "#B8860B" }}>
              Aligned rate: {usd(preview.aligned)}/hr
            </div>
            <div style={{ fontSize: 13, color: "#8A7F75", marginTop: 4 }}>
              Break-even: {usd(preview.breakEven)}/hr — the minimum before profit
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#8A7F75" }}>
            Complete compensation and expenses above to see your rate.
          </div>
        )}
      </div>
      {err ? <div style={{ color: "#B23B3B", fontSize: 12, marginTop: 10 }}>{err}</div> : null}
      <NavRow
        step={3}
        onBack={onBack}
        onSkip={onSkip}
        onNext={save}
        nextLabel={calculating ? "Calculating your rate…" : saving ? "Saving…" : "Save & continue →"}
        nextDisabled={saving || calculating}
      />
    </>
  );
}

function Step4Team({ onAdvance, onBack, onSkip }: { onAdvance: () => Promise<void>; onBack: () => void; onSkip: () => void }) {
  const [mode, setMode] = useState<"choose" | "add">("choose");

  if (mode === "choose") {
    return (
      <>
        <h2 style={titleStyle}>Do you have a team?</h2>
        <p style={bodyStyle}>
          Team members add to your cost floor and your billable capacity. Add them now or skip — you can always come back in Settings.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onAdvance} style={{ ...ghostBtn, padding: 14, width: "100%" }}>
            I work solo for now
            <div style={{ fontSize: 11, color: "#8A7F75", marginTop: 4, fontWeight: 400 }}>Skip this step</div>
          </button>
          <button type="button" onClick={() => setMode("add")} style={{ ...primaryBtn, padding: 14, width: "100%" }}>
            Add a team member
          </button>
        </div>
        <NavRow step={4} onBack={onBack} onSkip={onSkip} onNext={onAdvance} nextLabel="Save & continue →" />
      </>
    );
  }

  return (
    <>
      <h2 style={titleStyle}>Add a team member</h2>
      <p style={bodyStyle}>
        You can add members in more detail in Settings → Team. For now, continue and add them there after the tour.
      </p>
      <button type="button" onClick={() => setMode("choose")} style={{ ...ghostBtn, marginBottom: 6 }}>
        ← Back to options
      </button>
      <NavRow step={4} onBack={onBack} onSkip={onSkip} onNext={onAdvance} nextLabel="Save & continue →" />
    </>
  );
}

function Step5RateOrientation({ onAdvance, onSkip, onBack }: { onAdvance: () => Promise<void>; onSkip: () => void; onBack: () => void }) {
  return (
    <>
      <h2 style={titleStyle}>This is your aligned rate.</h2>
      <p style={bodyStyle}>
        Built from your compensation, expenses, team costs, and billable hours — this is the minimum your firm needs to charge per hour to cover costs and hit your margin target.{"\n\n"}The gap between this number and your billed rate is what Sightline tracks.
      </p>
      <p style={{ fontSize: 12, color: "#8A7F75", fontStyle: "italic", marginBottom: 4 }}>
        Click any ⓘ icon on the rate panel to see how each layer contributes.
      </p>
      <NavRow step={5} onBack={onBack} onSkip={onSkip} onNext={onAdvance} nextLabel="Next →" />
    </>
  );
}

function Step6Project({ onAdvance, onSkip, onBack }: { onAdvance: () => Promise<void>; onSkip: () => void; onBack: () => void }) {
  const [projectCreated, setProjectCreated] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sopAttached, setSopAttached] = useState(false);
  const [scopeReviewed, setScopeReviewed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Realtime: watch for a new project row for this firm while Step 6 is active.
  useEffect(() => {
    if (projectCreated) return;
    const ch = supabase
      .channel("tour-projects")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "projects" },
        (payload: any) => {
          const id = payload?.new?.id as string | undefined;
          if (id) {
            setProjectCreated(true);
            setProjectId(id);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectCreated]);

  // Fallback (and primary path): the ProjectSetupWizard dispatches a
  // window CustomEvent when it successfully creates a project. This works
  // even when `public.projects` is not in the Supabase realtime publication.
  useEffect(() => {
    if (projectCreated) return;
    const onCreated = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) {
        setProjectCreated(true);
        setProjectId(id);
      }
    };
    window.addEventListener("sightline:project-created", onCreated as EventListener);
    return () => window.removeEventListener("sightline:project-created", onCreated as EventListener);
  }, [projectCreated]);

  // Realtime: watch for project_phases inserted against the created project.
  useEffect(() => {
    if (!projectId || sopAttached) return;
    const ch = supabase
      .channel(`tour-phases-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_phases", filter: `project_id=eq.${projectId}` },
        () => setSopAttached(true),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, sopAttached]);

  // Scope review: 3s timer once user is on the project page and SOP is attached.
  useEffect(() => {
    if (!sopAttached || scopeReviewed) return;
    if (!location.pathname.startsWith("/projects/")) return;
    const t = setTimeout(() => setScopeReviewed(true), 3000);
    return () => clearTimeout(t);
  }, [sopAttached, scopeReviewed, location.pathname]);

  const goToProjectCreate = () =>
    navigate({ to: "/sightline", search: { new: 1 } as any });
  const goToSopLibrary = () => {
    if (projectId) navigate({ to: "/projects/$id", params: { id: projectId } } as any);
  };

  const item = (label: string, done: boolean, doneLabel: string) => (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <span
        style={{
          width: 14, height: 14, borderRadius: "50%",
          border: "1.5px solid " + (done ? "#B8860B" : "rgba(44,44,44,0.25)"),
          background: done ? "#B8860B" : "transparent",
          color: "#FAF7F2", fontSize: 11, display: "inline-flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
        }}
      >{done ? "✓" : ""}</span>
      <span>
        <span style={{ fontSize: 13, color: "#2C2C2C", fontWeight: done ? 500 : 400 }}>{label}</span>
        {done ? (
          <div style={{ fontSize: 11, color: "#5C8A6E", marginTop: 2 }}>{doneLabel}</div>
        ) : null}
      </span>
    </li>
  );

  const allDone = projectCreated && sopAttached && scopeReviewed;

  return (
    <>
      <h2 style={titleStyle}>Set up your first project.</h2>
      <p style={bodyStyle}>
        Track whether your projects are profitable in real time — not after you've already closed them. Connect a project to an SOP workflow and Sightline scopes the hours automatically.{"\n\n"}Then as you log time, the margin needle moves.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 12px" }}>
        {item("Create a project", projectCreated, "Project created ✓")}
        {item("Attach an SOP workflow", sopAttached, "Workflow attached ✓")}
        {item("Review scoped hours", scopeReviewed, "Scope reviewed ✓")}
      </ul>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onSkip} style={{ fontSize: 12, color: "#8A7F75", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
          Skip for now →
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {!projectCreated ? (
            <button type="button" onClick={goToProjectCreate} style={primaryBtn}>Create my first project →</button>
          ) : !sopAttached ? (
            <button type="button" onClick={goToSopLibrary} style={primaryBtn}>Go to SOP library →</button>
          ) : null}
          {projectCreated && sopAttached ? (
            <button
              type="button"
              onClick={onAdvance}
              style={{ ...primaryBtn, animation: allDone ? "tourPulseGold 600ms ease-out 1" : undefined }}
            >
              Next →
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Step7TimeEntry({ onComplete, onSkip, onBack }: { onComplete: () => Promise<void>; onSkip: () => void; onBack: () => void }) {
  const [saving, setSaving] = useState(false);
  const [entrySaved, setEntrySaved] = useState(false);

  // Realtime watcher for new time entries.
  useEffect(() => {
    if (entrySaved) return;
    const ch = supabase
      .channel("tour-time-entries")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "time_entries" },
        () => setEntrySaved(true),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [entrySaved]);

  const finish = async () => {
    setSaving(true);
    try { await onComplete(); } finally { setSaving(false); }
  };
  return (
    <>
      <h2 style={titleStyle}>Log your first hour.</h2>
      <p style={bodyStyle}>
        Every hour you log moves the margin needle on your projects and tells Sightline whether you're on track to hit your billable targets.{"\n\n"}Log time in the Time Calendar as you work — or import existing entries if you've been tracking elsewhere.
      </p>
      <ol style={{ paddingLeft: 18, color: "#6B6259", fontSize: 13, lineHeight: 1.9, margin: 0 }}>
        <li>Pick a date</li>
        <li>Select an activity type</li>
        <li>Enter hours worked</li>
        <li>Assign to a project (or log as firm time)</li>
        <li>Hit Log time</li>
      </ol>
      {entrySaved ? (
        <div style={{ background: "rgba(92,138,110,0.07)", borderLeft: "2px solid #5C8A6E", borderRadius: "0 4px 4px 0", padding: "6px 10px", marginTop: 10, fontSize: 12, color: "#5C8A6E" }}>
          First entry logged ✓ You're ready to finish.
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 8 }}>
        <button type="button" onClick={onSkip} style={{ fontSize: 12, color: "#8A7F75", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
          or skip this step →
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={!entrySaved || saving}
          title={!entrySaved ? "Log at least one hour to finish setup" : undefined}
          style={
            entrySaved
              ? { ...primaryBtn, animation: "tourPulseGold 600ms ease-out 1" }
              : { ...primaryBtn, background: "rgba(44,44,44,0.25)", color: "rgba(255,255,255,0.4)", cursor: "not-allowed" }
          }
        >
          {saving ? "Finishing…" : "Finish setup ✓"}
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────── Resume Prompt ─────────────────────────── */

function ResumePrompt({ onClick, step }: { onClick: () => void; step: number }) {
  const next = Math.min(7, step + 1);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        zIndex: 90,
        background: "#2C2C2C",
        color: "#FAF7F2",
        borderRadius: 10,
        padding: "12px 16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "Jost, system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>Continue setup →</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
        Step {next} of 7 remaining
      </div>
    </button>
  );
}

/* ─────────────────────────── Skip Confirmation ─────────────────────────── */

function SkipConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,44,44,0.65)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#FAF7F2", borderRadius: 10, padding: 24, maxWidth: 380, width: "100%", fontFamily: "Jost, system-ui, sans-serif", boxShadow: "0 8px 40px rgba(44,44,44,0.24)" }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2C2C2C", margin: 0, marginBottom: 10 }}>Are you sure?</h3>
        <p style={{ fontSize: 13, color: "#6B6259", lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>
          You'll need to enter your compensation and capacity in Settings to see your aligned rate.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} style={ghostBtn}>Continue setup</button>
          <button type="button" onClick={() => { void onConfirm(); }} style={primaryBtn}>Skip anyway</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Completion Banner ─────────────────────────── */

function CompletionBanner({ onDismiss }: { onDismiss: () => void | Promise<void> }) {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const remainingRef = useRef(10_000);
  const startedRef = useRef<number>(Date.now());

  const finish = useCallback(async () => {
    setHidden(true);
    setTimeout(() => { void onDismiss(); }, 200);
  }, [onDismiss]);

  useEffect(() => {
    if (paused) return;
    startedRef.current = Date.now();
    const remaining = remainingRef.current;
    const t = setTimeout(finish, remaining);
    return () => {
      const elapsed = Date.now() - startedRef.current;
      remainingRef.current = Math.max(0, remaining - elapsed);
      clearTimeout(t);
    };
  }, [paused, finish]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 95,
        background: "#FAF7F2",
        border: "0.5px solid rgba(44,44,44,0.14)",
        borderRadius: 10,
        boxShadow: "0 6px 24px rgba(44,44,44,0.14)",
        padding: 16,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        fontFamily: "Jost, system-ui, sans-serif",
        overflow: "hidden",
        opacity: hidden ? 0 : 1,
        transition: "opacity 200ms",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: "#2C2C2C" }}>You're all set.</div>
          <div style={{ fontSize: 13, color: "#6B6259", marginTop: 2, lineHeight: 1.5 }}>
            Your aligned rate is live — add projects and log time to start tracking profitability.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              document.querySelector('[data-tour="rate-panel"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{ background: "none", border: "none", color: "#B8860B", fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            Explore →
          </button>
          <button
            type="button"
            onClick={finish}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "#8A7F75", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>
      <div style={{ height: 2, background: "rgba(92,138,110,0.3)", marginTop: 12, borderRadius: 1, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: "#5C8A6E",
            width: "100%",
            transformOrigin: "left center",
            animation: paused ? "none" : `tourBannerBar ${remainingRef.current}ms linear forwards`,
          }}
        />
      </div>
      <style>{`@keyframes tourBannerBar { from { transform: scaleX(1);} to { transform: scaleX(0);} }`}</style>
    </div>
  );
}