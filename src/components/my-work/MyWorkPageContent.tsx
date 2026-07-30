import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWorkData } from "@/lib/my-work.functions";
import { LogTimeModal } from "@/components/my-work/LogTimeModal";
import { getBillableToggleLabel } from "@/lib/time-framing";
import { useMe } from "@/lib/role";
import { cn } from "@/lib/utils";

function memberInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarColor(seed: string) {
  const palette = ["#5C8A6E", "#B8860B", "#C4714A", "#6B6259", "#2C2C2C"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % palette.length;
  return palette[h];
}

function statusBorder(status: string | null | undefined) {
  if (status === "active" || status === "pipeline" || status === "pursuit") return "#5C8A6E";
  if (status === "on_hold") return "#B8860B";
  return "#8A7F75";
}

function daysAway(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type ProjectCard = {
  id: string;
  name: string;
  client_name?: string | null;
  status?: string | null;
  myAssignedHrs: number;
  myLoggedHrs: number;
  nextMilestone?: { label: string; milestone_date: string } | null;
  taskCount: number;
  completedTaskCount: number;
};

export function MyWorkPageContent({ previewMemberId }: { previewMemberId?: string | null }) {
  const nav = useNavigate();
  const { data: me, realIsSuper } = useMe();
  const role = me?.profile?.role as string | undefined;
  const canAssignTeamMember = realIsSuper || role === "principal" || role === "admin";
  const getData = useServerFn(getMyWorkData);
  const [logProject, setLogProject] = useState<{ id: string; name: string } | null>(null);
  const billableToggleLabel = getBillableToggleLabel(
    (me?.config as { pricing_structure?: string } | null)?.pricing_structure ?? null,
  );

  const q = useQuery({
    queryKey: ["my-work", previewMemberId ?? "self"],
    queryFn: () => getData({ data: { previewMemberId: previewMemberId ?? null } }),
  });

  const data = q.data;
  const projects = (data?.projects ?? []) as ProjectCard[];

  const previewBanner = data?.previewMode ? (
    <div
      className="mb-4 rounded-lg border border-[#B8860B]/30 bg-[#F5EDD6] px-4 py-3"
      style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259" }}
    >
      <span className="font-medium text-[#B8860B]">{data.previewName}&apos;s workspace · Preview mode</span>
      <div className="mt-0.5">You&apos;re viewing Sightline as {data.previewName} sees it.</div>
    </div>
  ) : null;

  if (q.isLoading) {
    return <div className="py-16 text-center text-sm text-[#8A7F75]">Loading your work…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {previewBanner}

      <p
        className="mb-1 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        MY WORK
      </p>
      <h1
        className="text-[#2C2C2C]"
        style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 400 }}
      >
        Good {data?.greeting ?? "morning"}, {data?.displayName ?? "there"}
      </h1>
      {data?.firmName && (
        <p className="mt-1 text-[13px] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
          {data.firmName}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatTile label="Hours this week" value={String(Math.round((data?.weekHours ?? 0) * 10) / 10)} sub="logged so far" />
        <StatTile label="Projects active" value={String(data?.activeProjectCount ?? 0)} sub="assigned to you" />
        <StatTile
          label="Coming up"
          value={String(data?.upcomingMilestoneCount ?? 0)}
          sub="milestones this month"
          subClass={(data?.upcomingMilestoneCount ?? 0) > 0 ? "text-[#B8860B]" : "text-[#8A7F75]"}
        />
      </div>

      <p
        className="mb-3 mt-6 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        YOUR PROJECTS
      </p>

      {!projects.length ? (
        <div className="rounded-lg bg-[rgba(44,44,44,0.02)] px-6 py-8 text-center">
          <p
            className="italic text-[#8A7F75]"
            style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 15 }}
          >
            No projects assigned yet.
          </p>
          <p className="mt-1 text-[12px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
            Your firm owner will assign you to projects as they come in.
          </p>
        </div>
      ) : (
        projects.map((p) => {
          const assigned = p.myAssignedHrs || 0;
          const logged = p.myLoggedHrs || 0;
          const pct = assigned > 0 ? Math.min(100, (logged / assigned) * 100) : logged > 0 ? 100 : 0;
          const ms = p.nextMilestone;
          const msDays = ms ? daysAway(ms.milestone_date) : null;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                nav({
                  to: "/my-work/$projectId",
                  params: { projectId: p.id },
                  search: previewMemberId ? { preview_member: previewMemberId } : undefined,
                })
              }
              onKeyDown={(e) => e.key === "Enter" && nav({ to: "/my-work/$projectId", params: { projectId: p.id } })}
              className="mb-2.5 cursor-pointer rounded-r-[10px] border border-[rgba(44,44,44,0.10)] bg-white py-4 pl-[18px] pr-[18px]"
              style={{ borderLeft: `3px solid ${statusBorder(p.status)}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                    {p.name}
                  </div>
                  {p.client_name && (
                    <div className="mt-0.5 text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                      {p.client_name}
                    </div>
                  )}
                </div>
                <span
                  className="rounded-[10px] px-2 py-0.5 text-[10px] font-medium capitalize text-[#5C8A6E]"
                  style={{ fontFamily: "Jost, sans-serif", background: "rgba(92,138,110,0.12)" }}
                >
                  {p.status ?? "active"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                    MY HOURS
                  </div>
                  <div className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                    {logged.toFixed(1)} of {assigned.toFixed(1)} hrs
                  </div>
                  <div className="mt-1 h-1 rounded-sm bg-[#FAF7F2]">
                    <div className="h-1 rounded-sm bg-[#5C8A6E]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                    NEXT MILESTONE
                  </div>
                  {ms ? (
                    <>
                      <div className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                        {ms.label}
                      </div>
                      <div
                        className={cn(
                          "text-[11px]",
                          msDays != null && msDays <= 7 ? "text-[#B8860B]" : "text-[#8A7F75]",
                        )}
                        style={{ fontFamily: "Jost, sans-serif" }}
                      >
                        {fmtDate(ms.milestone_date)}
                        {msDays != null ? ` · ${msDays}d` : ""}
                      </div>
                    </>
                  ) : (
                    <div className="text-[12px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                      None scheduled
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                {p.taskCount > 0 ? (
                  <span className="text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                    {p.taskCount} tasks · {p.completedTaskCount} complete
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="text-[11px] text-[#B8860B] underline"
                  style={{ fontFamily: "Jost, sans-serif" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!data?.previewMode) setLogProject({ id: p.id, name: p.name });
                  }}
                >
                  Log time →
                </button>
              </div>
            </div>
          );
        })
      )}

      <p
        className="mb-3 mt-5 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        RECENT TIME
      </p>
      {(data?.recentEntries ?? []).map(
        (e: { id: string; date: string; hrs: number; billable: boolean; projects?: { name?: string } | null }) => (
          <div
            key={e.id}
            className="flex items-center gap-2.5 border-b border-[rgba(44,44,44,0.07)] py-2"
          >
            <span className="w-12 shrink-0 text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
              {fmtDate(e.date)}
            </span>
            <span className="flex-1 text-[13px] text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
              {e.projects?.name ?? "—"}
            </span>
            <span className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
              {Number(e.hrs).toFixed(1)}
            </span>
            <span
              className={cn("h-[7px] w-[7px] rounded-full", e.billable ? "bg-[#5C8A6E]" : "bg-[#B8860B]")}
            />
          </div>
        ),
      )}
      <button
        type="button"
        onClick={() => nav({ to: "/time-calendar" })}
        className="mt-2.5 block text-[12px] text-[#B8860B] underline"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        View all time →
      </button>

      {logProject && (
        <LogTimeModal
          open={!!logProject}
          onClose={() => setLogProject(null)}
          projectId={logProject.id}
          projectName={logProject.name}
          billableToggleLabel={billableToggleLabel}
          canAssignTeamMember={canAssignTeamMember}
          onSaved={() => q.refetch()}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  subClass,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="rounded-lg border border-[rgba(44,44,44,0.10)] bg-white px-3 py-3">
      <div className="text-[10px] uppercase tracking-wide text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
        {label}
      </div>
      <div
        className="text-[#2C2C2C]"
        style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 400 }}
      >
        {value}
      </div>
      <div className={cn("text-[11px]", subClass ?? "text-[#8A7F75]")} style={{ fontFamily: "Jost, sans-serif" }}>
        {sub}
      </div>
    </div>
  );
}

export { memberInitials, avatarColor };
