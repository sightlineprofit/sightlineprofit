import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TrendingUp, Clock, Receipt, Check, ChevronDown, ChevronUp } from "lucide-react";
import { getActionEngineState, recordReconsideration } from "@/lib/action-engine.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICONS = {
  underpriced: { Icon: TrendingUp, bg: "rgba(196,113,74,0.12)", color: "#C4714A" },
  low_utilization: { Icon: Clock, bg: "rgba(184,134,11,0.12)", color: "#B8860B" },
  cost_creep: { Icon: Receipt, bg: "rgba(92,138,110,0.12)", color: "#5C8A6E" },
  committed: { Icon: Check, bg: "rgba(92,138,110,0.12)", color: "#5C8A6E" },
} as const;

const PRIORITY_COLORS: Record<1 | 2 | 3, { bg: string; color: string }> = {
  1: { bg: "#C4714A", color: "#FFFFFF" },
  2: { bg: "#B8860B", color: "#FFFFFF" },
  3: { bg: "rgba(44,44,44,0.35)", color: "#FFFFFF" },
};

export function ActionEnginePanel() {
  const fetch = useServerFn(getActionEngineState);
  const { data } = useQuery({ queryKey: ["action-engine"], queryFn: () => fetch() });
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reconsiderOpen, setReconsiderOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const reconsiderFn = useServerFn(recordReconsideration);
  const reconsider = useMutation({
    mutationFn: reconsiderFn,
    onSuccess: () => {
      toast.success("Thanks — we'll adjust your next actions.");
      setReconsiderOpen(false);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["action-engine"] });
      qc.invalidateQueries({ queryKey: ["commitments"] });
    },
  });

  if (!data || !("visible" in data) || !data.visible) return null;

  const { Icon, bg, color } = ICONS[data.profile];

  return (
    <div
      className="rounded-lg border bg-white p-6"
      style={{ borderColor: "rgba(44,44,44,0.10)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: bg }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[#aaa]"
            style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Your most leveraged action right now
          </div>
          <h3
            className="mt-1"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: "#2C2C2C" }}
          >
            {data.headline}
          </h3>
          <p
            className="mt-1 text-ch/50"
            style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 300 }}
          >
            Gap composition: {data.pricingGapPct.toFixed(0)}% pricing ·{" "}
            {data.utilGapPct.toFixed(0)}% utilization · {data.costGapPct.toFixed(0)}% cost structure
          </p>
        </div>
      </div>

      {/* Actions */}
      <ol className="mt-5 space-y-4">
        {data.actions.map((a) => {
          const p = PRIORITY_COLORS[a.priority];
          const isReconsider = a.actionType === "commit_reconsider";
          return (
            <li key={a.actionType} className="flex gap-3">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                style={{ background: p.bg, color: p.color, fontFamily: "'Jost', sans-serif" }}
              >
                {a.priority}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-ch"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, fontWeight: 500, lineHeight: 1.45 }}
                >
                  {a.text}
                </p>
                <p
                  className="mt-1 text-ch/50"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 300, lineHeight: 1.55 }}
                >
                  {a.why}
                </p>
                {isReconsider ? (
                  <button
                    onClick={() => {
                      if (data.openCommitment) setReconsiderOpen(true);
                    }}
                    className="mt-1 text-left hover:underline"
                    style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 500, color: "#B8860B" }}
                  >
                    {a.linkLabel}
                  </button>
                ) : (
                  <Link
                    to={a.linkTo}
                    className="mt-1 inline-block hover:underline"
                    style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 500, color: "#B8860B" }}
                  >
                    {a.linkLabel}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Reconsider inline form */}
      {reconsiderOpen && data.openCommitment && (
        <div
          className="mt-4 rounded border p-3"
          style={{ borderColor: "rgba(44,44,44,0.10)", background: "#FAF7F2" }}
        >
          <label
            className="block text-ch/60"
            style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 500 }}
          >
            What got in the way?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded border bg-white p-2 text-[12px] outline-none focus:ring-1 focus:ring-gold/40"
            style={{ fontFamily: "'Jost', sans-serif", borderColor: "rgba(44,44,44,0.15)" }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setReconsiderOpen(false)}
              className="rounded border px-3 py-1 text-[11px]"
              style={{ borderColor: "rgba(44,44,44,0.15)", fontFamily: "'Jost', sans-serif" }}
            >
              Cancel
            </button>
            <button
              disabled={!notes.trim() || reconsider.isPending}
              onClick={() =>
                reconsider.mutate({
                  data: { commitmentId: data.openCommitment!.id, notes: notes.trim() },
                })
              }
              className="rounded px-3 py-1 text-[11px] text-white disabled:opacity-40"
              style={{ background: "#B8860B", fontFamily: "'Jost', sans-serif" }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Signal basis — collapsible */}
      <div className="mt-6 border-t pt-4" style={{ borderColor: "rgba(44,44,44,0.08)" }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-[#aaa] hover:text-ch/70"
          style={{
            fontFamily: "'Jost', sans-serif",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span>Why these actions — your signals</span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {expanded && (
          <div className="mt-3 overflow-hidden rounded border" style={{ borderColor: "rgba(44,44,44,0.08)" }}>
            <table className="w-full">
              <tbody>
                {data.signals.map((s, i) => (
                  <tr key={s.key} className={i > 0 ? "border-t" : ""} style={{ borderColor: "rgba(44,44,44,0.06)" }}>
                    <td
                      className="px-3 py-2 text-ch/60"
                      style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 400 }}
                    >
                      {s.key}
                    </td>
                    <td
                      className={cn("px-3 py-2 text-right", s.flagged ? "" : "")}
                      style={{
                        fontFamily: "'Jost', sans-serif",
                        fontSize: 11,
                        fontWeight: 500,
                        color: s.flagged ? "#C4714A" : "#2C2C2C",
                      }}
                    >
                      {s.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p
          className="mt-3 italic text-ch/40"
          style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 300 }}
        >
          {data.rotationNote}
        </p>
      </div>

      {/* Commit button */}
      <div className="mt-5 flex justify-end">
        <Link
          to="/rate-architecture"
          search={{ tab: "commit" } as any}
          className="rounded px-4 py-2 text-white transition-opacity hover:opacity-90"
          style={{
            background: "#2C2C2C",
            fontFamily: "'Jost', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          Commit to action →
        </Link>
      </div>
    </div>
  );
}
