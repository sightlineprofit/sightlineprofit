import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { TeamHoursMember } from "./TeamHoursTile";

const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

const REMINDER_KEY = "sightline:team-hours-last-reminded-at";

function StatBox({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
}) {
  return (
    <div style={{ background: CREAM, borderRadius: 4, padding: "6px 8px", minWidth: 0 }}>
      <p style={{ fontSize: 9, color: MUTED_LT, marginBottom: 2, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, color: valueColor, lineHeight: 1.15 }}>
        {value}
      </p>
      <p style={{ fontSize: 9, color: MUTED_LT, marginTop: 2, lineHeight: 1.2 }}>{sub}</p>
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="overflow-hidden rounded-full" style={{ height: 4, background: CREAM }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color ?? GOLD }}
      />
    </div>
  );
}

export function HoursPulseTile({
  weekBillable,
  targetHrs,
  trend,
  members,
  trailingEntries,
  weekStartIso,
  weekEndIso,
  firmName,
  principalName,
  className,
}: {
  weekBillable: number;
  targetHrs: number;
  trend: Array<{ billable: number; total: number }>;
  members: TeamHoursMember[];
  trailingEntries: Array<{ user_id?: string | null; hrs: number | null; date: string }>;
  weekStartIso: string;
  weekEndIso: string;
  firmName: string;
  principalName: string;
  className?: string;
}) {
  const remaining = Math.max(0, targetHrs - weekBillable);
  const hoursPct = targetHrs > 0 ? (weekBillable / targetHrs) * 100 : 0;
  const hoursColor = remaining <= 0 ? SAGE : weekBillable >= targetHrs * 0.5 ? GOLD : TERRA;

  const trendAvg = trend.length > 0 ? trend.reduce((s, w) => s + w.billable, 0) / trend.length : 0;
  const trendUtil = targetHrs > 0 ? (trendAvg / targetHrs) * 100 : 0;
  const weeksOnTarget = trend.filter((w) => targetHrs > 0 && w.billable >= targetHrs).length;
  const trendColor = weeksOnTarget >= 3 ? SAGE : weeksOnTarget === 2 ? GOLD : TERRA;

  const nonPrincipal = useMemo(
    () => members.filter((m) => (m.role_type ?? "") !== "principal"),
    [members],
  );

  const hoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trailingEntries) {
      const uid = t.user_id;
      if (!uid) continue;
      if (t.date >= weekStartIso && t.date < weekEndIso) {
        map.set(uid, (map.get(uid) ?? 0) + Number(t.hrs || 0));
      }
    }
    return map;
  }, [trailingEntries, weekStartIso, weekEndIso]);

  const teamRows = useMemo(
    () =>
      nonPrincipal.map((m) => {
        const logged = m.profile_id ? hoursByUser.get(m.profile_id) ?? 0 : 0;
        return { m, logged };
      }),
    [nonPrincipal, hoursByUser],
  );

  const totalMembers = teamRows.length;
  const loggedMembers = teamRows.filter((r) => r.logged > 0).length;
  const notLogged = teamRows.filter((r) => r.logged <= 0);
  const allLogged = totalMembers > 0 && notLogged.length === 0;
  const noneLogged = totalMembers > 0 && loggedMembers === 0;
  const teamColor = allLogged ? SAGE : noneLogged ? TERRA : GOLD;

  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const handleRemind = () => {
    if (notLogged.length === 0) return;
    try {
      const last = Number(window.localStorage.getItem(REMINDER_KEY) || 0);
      if (Date.now() - last < 60 * 60 * 1000) {
        setConfirmMsg("Reminder already sent recently");
        window.setTimeout(() => setConfirmMsg(null), 3000);
        return;
      }
    } catch {}

    const targets = notLogged.filter((r) => r.m.email);
    if (targets.length === 0) {
      setConfirmMsg("No email addresses on file");
      window.setTimeout(() => setConfirmMsg(null), 3000);
      return;
    }
    const to = targets.map((r) => r.m.email).join(",");
    const subject = "Reminder: log your hours in Sightline";
    const link = `${window.location.origin}/time-calendar`;
    const firstName = targets.length === 1 ? (targets[0].m.name || "").split(" ")[0] : "team";
    const body =
      `Hi ${firstName},\n\n` +
      `This is a quick reminder to log your hours in Sightline for this week. ` +
      `Keeping your time entries current helps ${firmName} track project margin and capacity accurately.\n\n` +
      `Log my hours → ${link}\n\n` +
      `— ${principalName}`;
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      window.localStorage.setItem(REMINDER_KEY, String(Date.now()));
    } catch {}
    setConfirmMsg(`Reminder sent to ${targets.length} member${targets.length === 1 ? "" : "s"}`);
    window.setTimeout(() => setConfirmMsg(null), 3000);
  };

  return (
    <div
      className={`flex flex-col border bg-white ${className ?? ""}`}
      style={{ borderColor: BORDER, borderRadius: 6, padding: "12px 16px" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Time & utilization
        </p>
        <Link to="/time-calendar" style={{ fontSize: 11, color: GOLD, flexShrink: 0 }} className="hover:underline">
          Enter hours →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <StatBox
          label="Hours this week"
          value={`${weekBillable.toFixed(1)}/${targetHrs}`}
          sub={remaining <= 0 ? "target reached" : `${remaining.toFixed(1)} hrs left`}
          valueColor={hoursColor}
        />
        <StatBox
          label="4-week trend"
          value={`${trendAvg.toFixed(1)}/${targetHrs}`}
          sub={`${weeksOnTarget} of 4 on target`}
          valueColor={trendColor}
        />
        <StatBox
          label="Team logged"
          value={totalMembers > 0 ? `${loggedMembers}/${totalMembers}` : "—"}
          sub={totalMembers > 0 ? "members this week" : "no team yet"}
          valueColor={teamColor}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span style={{ fontSize: 10, color: MUTED }}>Your billable hours</span>
          <span style={{ fontSize: 10, color: MUTED_LT }}>{Math.round(hoursPct)}%</span>
        </div>
        <MiniBar pct={hoursPct} color={hoursColor} />
      </div>

      <div style={{ marginTop: 6 }}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span style={{ fontSize: 10, color: MUTED }}>Weekly utilization</span>
          <span style={{ fontSize: 10, color: MUTED_LT }}>{Math.round(trendUtil)}%</span>
        </div>
        <MiniBar pct={trendUtil} color={trendColor} />
      </div>

      <div className="min-h-2 flex-1" aria-hidden />

      {totalMembers > 0 && (
        <div
          className="flex items-center justify-between gap-2 pt-2"
          style={{
            background: CREAM,
            borderLeft: `3px solid ${GOLD}`,
            borderRadius: 4,
            padding: "8px 10px",
          }}
        >
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, fontStyle: "italic", color: MUTED, lineHeight: 1.45 }}>
            {allLogged
              ? "All team members logged hours this week."
              : noneLogged
                ? "No team entries yet — remind your team to log time."
                : `${loggedMembers} of ${totalMembers} members logged · ${notLogged.map((r) => r.m.name.split(" ")[0]).join(", ")} still pending.`}
          </p>
          {!allLogged && (
            <button
              type="button"
              onClick={handleRemind}
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 10,
                color: GOLD,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                flexShrink: 0,
              }}
              className="hover:underline"
            >
              Remind →
            </button>
          )}
        </div>
      )}

      {confirmMsg ? (
        <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: SAGE, marginTop: 6 }}>{confirmMsg}</p>
      ) : null}
    </div>
  );
}
