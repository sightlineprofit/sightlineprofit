import { useMemo, useState } from "react";

const GOLD = "#B8860B";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "rgba(44,44,44,0.55)";
const TEXT = "#2C2C2C";
const BORDER = "rgba(44,44,44,0.12)";

const DOT_PALETTE = ["#B8860B", "#5C8A6E", "#C4714A", "#7A6FBE", "#3F7D96", "#B5652E", "#8A6E3F", "#5D7A5D"];

function dotColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DOT_PALETTE[h % DOT_PALETTE.length];
}

export interface TeamHoursMember {
  id: string;
  profile_id?: string | null;
  name: string;
  email?: string | null;
  role_type?: string | null;
  expected_hrs_per_week?: number | null;
}

export interface TeamHoursTileProps {
  members: TeamHoursMember[];
  trailingEntries: Array<{ user_id?: string | null; hrs: number | null; date: string }>;
  weekStartIso: string;
  weekEndIso: string;
  firmName: string;
  principalName: string;
}

const REMINDER_KEY = "sightline:team-hours-last-reminded-at";

export function TeamHoursTile({
  members,
  trailingEntries,
  weekStartIso,
  weekEndIso,
  firmName,
  principalName,
}: TeamHoursTileProps) {
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

  const rows = useMemo(
    () =>
      nonPrincipal.map((m) => {
        const target = Number(m.expected_hrs_per_week || 0);
        const logged = m.profile_id ? hoursByUser.get(m.profile_id) ?? 0 : 0;
        const pct = target > 0 ? (logged / target) * 100 : logged > 0 ? 100 : 0;
        let color = TERRA;
        if (target > 0) {
          if (logged >= target) color = SAGE;
          else if (logged >= target * 0.5) color = GOLD;
          else color = TERRA;
        } else if (logged > 0) color = SAGE;
        return { m, target, logged, pct, color };
      }),
    [nonPrincipal, hoursByUser],
  );

  const notLogged = rows.filter((r) => r.logged <= 0);
  const totalMembers = rows.length;
  const loggedMembers = totalMembers - notLogged.length;
  const allLogged = totalMembers > 0 && notLogged.length === 0;
  const noneLogged = totalMembers > 0 && loggedMembers === 0;

  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  if (totalMembers === 0) return null;

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
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    try {
      window.localStorage.setItem(REMINDER_KEY, String(Date.now()));
    } catch {}
    setConfirmMsg(`Reminder sent to ${targets.length} member${targets.length === 1 ? "" : "s"}`);
    window.setTimeout(() => setConfirmMsg(null), 3000);
  };

  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 6,
        padding: "14px 18px",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "'Jost', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Team hours this week
        </div>
        {allLogged ? (
          <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: SAGE }}>
            All up to date ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRemind}
            style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: 11,
              color: GOLD,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            className="hover:underline"
          >
            Remind team →
          </button>
        )}
      </div>

      <div>
        {rows.map((r, idx) => (
          <div
            key={r.m.id}
            className="flex items-center justify-between"
            style={{
              padding: "8px 0",
              borderTop: idx === 0 ? "none" : `0.5px solid ${BORDER}`,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: dotColor(r.m.id),
                  flexShrink: 0,
                }}
              />
              <div className="min-w-0">
                <div
                  style={{
                    fontFamily: "'Jost', sans-serif",
                    fontSize: 11,
                    fontWeight: 500,
                    color: TEXT,
                    lineHeight: 1.2,
                  }}
                  className="truncate"
                >
                  {r.m.name}
                </div>
                {r.m.role_type ? (
                  <div
                    style={{
                      fontFamily: "'Jost', sans-serif",
                      fontSize: 11,
                      color: MUTED,
                      lineHeight: 1.2,
                      textTransform: "capitalize",
                    }}
                  >
                    {String(r.m.role_type).replace(/_/g, " ")}
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              {r.logged > 0 ? (
                <>
                  <div
                    style={{
                      fontFamily: "'Jost', sans-serif",
                      fontSize: 11,
                      fontWeight: 500,
                      color: r.color,
                    }}
                  >
                    {r.logged.toFixed(1)} / {r.target || 0} hrs
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      height: 2,
                      width: 60,
                      background: "rgba(44,44,44,0.06)",
                      borderRadius: 1,
                      overflow: "hidden",
                      marginLeft: "auto",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, r.pct))}%`,
                        height: "100%",
                        background: r.color,
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontFamily: "'Jost', sans-serif",
                      fontSize: 11,
                      fontWeight: 500,
                      color: TERRA,
                    }}
                  >
                    No entry
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      width: 60,
                      textAlign: "right",
                      fontSize: 11,
                      color: MUTED,
                      marginLeft: "auto",
                      lineHeight: 1,
                    }}
                  >
                    —
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: `0.5px solid ${BORDER}`,
          paddingTop: 8,
          marginTop: 8,
          fontFamily: "'Jost', sans-serif",
          fontSize: 11,
          color: allLogged ? SAGE : noneLogged ? TERRA : MUTED,
        }}
      >
        {allLogged
          ? "All team members up to date ✓"
          : noneLogged
            ? "No team entries yet this week"
            : `${loggedMembers} of ${totalMembers} members logged hours this week`}
      </div>

      {confirmMsg ? (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'Jost', sans-serif",
            fontSize: 11,
            color: SAGE,
          }}
        >
          {confirmMsg}
        </div>
      ) : null}
    </div>
  );
}