import { CheckCircle2, Circle, Loader2, Lock, ExternalLink } from "lucide-react";

type StepStatus = "completed" | "in_progress" | "not_started" | "locked";

type Step = {
  n: number;
  title: string;
  detail: string;
  status: StepStatus;
};

// Update statuses after completing steps (see deploy/launch-runbook.md).
const STEPS: Step[] = [
  {
    n: 1,
    title: "Verify domain email (Resend)",
    detail:
      "Verify sightlineprofit.com in Resend; set RESEND_API_KEY + TRANSACTIONAL_EMAIL_FROM on the Cloudflare Worker.",
    status: "not_started",
  },
  {
    n: 2,
    title: "Complete Stripe activation (live)",
    detail: "Business details, bank account, and live mode enabled in the Stripe Dashboard.",
    status: "in_progress",
  },
  {
    n: 3,
    title: "Configure live Stripe keys + webhook",
    detail:
      "STRIPE_LIVE_API_KEY and PAYMENTS_LIVE_WEBHOOK_SECRET on Cloudflare; webhook URL on sightlineprofit.com.",
    status: "not_started",
  },
  {
    n: 4,
    title: "Production release script",
    detail: "Use npm run release:prod (migrations + schema verify + deploy) for every production push.",
    status: "not_started",
  },
  {
    n: 5,
    title: "Production smoke test",
    detail: "Auth, checkout, invite email, Sightline workflow + time log — deploy/launch-runbook.md §4.",
    status: "not_started",
  },
];

const SANDBOX_ACCOUNT_ID = "acct_1TqwY6LQ8U7DDPN2";

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "completed")
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Completed" />;
  if (status === "in_progress")
    return <Loader2 className="h-5 w-5 animate-spin text-gold" aria-label="In progress" />;
  if (status === "locked") return <Lock className="h-5 w-5 text-ch/30" aria-label="Locked" />;
  return <Circle className="h-5 w-5 text-ch/40" aria-label="Not started" />;
}

function StatusPill({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; cls: string }> = {
    completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    in_progress: { label: "In progress", cls: "bg-goldp/50 text-ch border-gold/40" },
    not_started: { label: "Not started", cls: "bg-creamd text-ch/70 border-border" },
    locked: { label: "Locked", cls: "bg-creamd/60 text-ch/40 border-border" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

export function GoLiveChecklist() {
  const completedCount = STEPS.filter((s) => s.status === "completed").length;
  const allDone = completedCount === STEPS.length;

  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            className="text-ch"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}
          >
            Public launch readiness
          </h3>
          <p className="mt-1 text-xs text-ch/60">
            {allDone
              ? "All steps complete — ready for public launch."
              : `${completedCount} of ${STEPS.length} complete. See deploy/launch-runbook.md.`}
          </p>
        </div>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-creamd/50 px-3 py-1.5 text-xs hover:bg-creamd"
        >
          Open Stripe dashboard
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <ol className="mt-4 space-y-2">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
              s.status === "in_progress"
                ? "border-gold/40 bg-goldp/20"
                : "border-border bg-white"
            }`}
          >
            <div className="pt-0.5">
              <StatusIcon status={s.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ch">
                  Step {s.n}. {s.title}
                </span>
                <StatusPill status={s.status} />
              </div>
              <p className="mt-1 text-xs text-ch/60">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between text-[11px] text-ch/50">
        <span>
          Sandbox account: <code className="font-mono">{SANDBOX_ACCOUNT_ID}</code>
        </span>
        <span>Update step statuses in GoLiveChecklist.tsx as you complete launch-runbook items.</span>
      </div>
    </section>
  );
}
