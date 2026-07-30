import { useMemo, useState } from "react";
import {
  MONTH_ABBR,
  buildCalendarProjects,
  buildRetainerCalendarProjects,
  buildEventBlocks,
  blockRadiusClass,
  monthCellPosition,
  type CalendarEventBlock,
} from "@/lib/capacity-calendar";
import type { CapacityPlannerData } from "@/lib/capacity.functions";
import type { MonthCapacity } from "@/lib/finance";
import { isRetainerFirm } from "@/lib/pricing-structure";
import { fmtUsd } from "@/lib/finance";
import {
  eventEffectiveCapacityPct,
  exceptionsInMonth,
  seasonBlockTone,
  seasonMonthSpan,
} from "@/lib/schedule-blocks";
import { MonthWeekBreakdown } from "@/components/capacity/planner/MonthWeekBreakdown";
import { cn } from "@/lib/utils";

const GRID = "72px repeat(12, 1fr)";

export function CapacityYearCalendar({ data }: { data: CapacityPlannerData }) {
  const year = data.year;
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const lifeEventsOnly = useMemo(
    () =>
      data.effective.lifeEvents.filter(
        (e) => !e.block_type || e.block_type === "life_event" || e.block_type === "blackout_date",
      ),
    [data.effective.lifeEvents],
  );

  const seasonEvents = useMemo(
    () => data.effective.lifeEvents.filter((e) => e.block_type === "recurring_season"),
    [data.effective.lifeEvents],
  );

  const calendarProjects = useMemo(
    () => buildCalendarProjects(data.projects, year, data.billableHrsPerWeek),
    [data.projects, year, data.billableHrsPerWeek],
  );

  const retainerCalendarProjects = useMemo(
    () =>
      isRetainerFirm(data.pricingStructure)
        ? buildRetainerCalendarProjects(
            data.projects,
            year,
            data.retainerHoursByProject,
          )
        : [],
    [data.projects, data.pricingStructure, data.retainerHoursByProject, year],
  );

  const allCalendarRows = useMemo(
    () => [...calendarProjects, ...retainerCalendarProjects],
    [calendarProjects, retainerCalendarProjects],
  );

  const leaveBlocks = useMemo(
    () => buildEventBlocks(lifeEventsOnly, year, "leave"),
    [lifeEventsOnly, year],
  );

  const reducedBlocks = useMemo(
    () => buildEventBlocks(lifeEventsOnly, year, "reduced"),
    [lifeEventsOnly, year],
  );

  const leaveMonths = useMemo(
    () => new Set(data.effective.monthlyProfile.filter((m) => m.isLeave).map((m) => m.month)),
    [data.effective.monthlyProfile],
  );

  const showThreshold =
    data.sayNo.thresholdReached && data.sayNo.thresholdMonth != null && allCalendarRows.length > 0;

  return (
    <div className="mb-5">
      <CalendarLegend />

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className="grid border-b border-border bg-cream px-3.5 py-2.5"
              style={{ gridTemplateColumns: GRID }}
            >
              <div />
              {MONTH_ABBR.map((label, i) => {
                const month = i + 1;
                const isCurrent = month === currentMonth && year === new Date().getFullYear();
                return (
                  <div
                    key={label}
                    className={cn(
                      "text-center font-sans text-[10px] font-medium tracking-wide",
                      isCurrent ? "text-ch" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            <div className="max-h-[480px] overflow-y-auto">
              {allCalendarRows.length === 0 ? (
                <GridRow label="Projects" labelClassName="text-muted-foreground italic">
                  {MONTH_ABBR.map((_, i) => (
                    <Cell key={i + 1} />
                  ))}
                </GridRow>
              ) : (
                allCalendarRows.map((project, rowIdx) => {
                  const isLast = rowIdx === allCalendarRows.length - 1;
                  const rowLabel = project.isRetainer
                    ? project.clientName?.trim() || project.name
                    : project.name;
                  return (
                    <GridRow key={project.id} label={rowLabel} labelClassName="text-muted-foreground">
                      {MONTH_ABBR.map((_, i) => {
                        const month = i + 1;
                        const pos = monthCellPosition(month, project.startMonth, project.endMonth);
                        const showMarker =
                          showThreshold && isLast && month === data.sayNo.thresholdMonth;
                        const tooltip = project.isRetainer
                          ? retainerTooltip(project)
                          : undefined;
                        return (
                          <Cell key={month}>
                            {pos !== "empty" && (
                              <ProjectBlock
                                pos={pos}
                                variant={project.isRetainer ? "retainer" : "project"}
                                label={
                                  project.isRetainer
                                    ? undefined
                                    : pos === "start"
                                      ? "Start"
                                      : pos === "end"
                                        ? "Done"
                                        : pos === "single"
                                          ? abbreviate(project.name)
                                          : undefined
                                }
                                title={tooltip}
                              />
                            )}
                            {showMarker && <SayNoThresholdMarker />}
                          </Cell>
                        );
                      })}
                    </GridRow>
                  );
                })
              )}

              {seasonEvents.map((season) => {
                const span = seasonMonthSpan(season, year);
                if (!span) return null;
                const pct = eventEffectiveCapacityPct(season);
                const tone = seasonBlockTone(pct);
                return (
                  <GridRow key={season.id} label={season.name} labelClassName="text-muted-foreground">
                    {MONTH_ABBR.map((_, i) => {
                      const month = i + 1;
                      const pos = monthCellPosition(month, span.startMonth, span.endMonth);
                      const monthExceptions = exceptionsInMonth(
                        data.scheduleExceptions,
                        season.id,
                        year,
                        month,
                      );
                      const tooltip = pos !== "empty"
                        ? `${monthExceptions.length} exception week${monthExceptions.length === 1 ? "" : "s"} · Default ${pct}%`
                        : undefined;
                      return (
                        <Cell key={month}>
                          {pos !== "empty" && (
                            <SeasonBlock
                              pos={pos}
                              tone={tone}
                              title={tooltip}
                              exceptions={monthExceptions}
                            />
                          )}
                        </Cell>
                      );
                    })}
                  </GridRow>
                );
              })}

              {leaveBlocks.length > 0 && (
                <GridRow label="Leave" labelClassName="text-gold" rowClassName="bg-gold/[0.03]">
                  {MONTH_ABBR.map((_, i) => {
                    const month = i + 1;
                    return (
                      <Cell key={month} className={leaveMonths.has(month) ? "bg-gold/[0.03]" : undefined}>
                        {leaveBlocks
                          .filter((b) => month >= b.startMonth && month <= b.endMonth)
                          .map((b) => (
                            <LifeEventBlock key={b.event.id} block={b} month={month} variant="leave" />
                          ))}
                      </Cell>
                    );
                  })}
                </GridRow>
              )}

              {reducedBlocks.length > 0 && (
                <GridRow label="Time off" labelClassName="text-muted-foreground">
                  {MONTH_ABBR.map((_, i) => {
                    const month = i + 1;
                    return (
                      <Cell key={month}>
                        {reducedBlocks
                          .filter((b) => month >= b.startMonth && month <= b.endMonth)
                          .map((b) => (
                            <LifeEventBlock key={b.event.id} block={b} month={month} variant="reduced" />
                          ))}
                      </Cell>
                    );
                  })}
                </GridRow>
              )}

              <CapacitySummaryRow
                profile={data.effective.monthlyProfile}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
              />
            </div>
          </div>
        </div>
      </div>

      {selectedMonth != null && (
        <MonthWeekBreakdown
          month={selectedMonth}
          year={year}
          data={data}
          onClose={() => setSelectedMonth(null)}
        />
      )}
    </div>
  );
}

function CalendarLegend() {
  const items = [
    { color: "bg-success/30", label: "Active project" },
    { color: "bg-gold/30", label: "Leave / reduced capacity" },
    { color: "bg-ch/10", label: "Vacation / time off" },
    { color: "bg-[repeating-linear-gradient(45deg,rgba(44,44,44,0.06),rgba(44,44,44,0.06)_2px,transparent_2px,transparent_6px)]", label: "Recurring season", stripe: true },
    { label: "Say-no threshold", line: true },
  ];

  return (
    <div className="mb-3 flex flex-wrap gap-4">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
          {item.line ? (
            <span className="inline-block h-3 w-0.5 bg-success" />
          ) : item.stripe ? (
            <span className="inline-block h-[7px] w-5 rounded-sm border border-border/60 bg-ch/[0.04]" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(44,44,44,0.08),rgba(44,44,44,0.08)_2px,transparent_2px,transparent_5px)" }} />
          ) : (
            <span className={cn("inline-block h-[7px] w-[7px] rounded-full", item.color)} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function GridRow({
  label,
  labelClassName,
  rowClassName,
  children,
}: {
  label: string;
  labelClassName?: string;
  rowClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-h-11 items-center border-b border-border/70 px-3.5 py-1.5",
        rowClassName,
      )}
      style={{ gridTemplateColumns: GRID }}
    >
      <div className={cn("truncate font-sans text-xs", labelClassName)} title={label}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("relative min-h-[26px] px-0.5", className)}>{children}</div>;
}

function retainerTooltip(project: {
  monthlyFee?: number;
  avgHoursPerMonth?: number | null;
  realizedRate?: number | null;
}): string {
  const fee = project.monthlyFee ?? 0;
  const hrs = project.avgHoursPerMonth;
  if (hrs == null || hrs <= 0) {
    return `${fmtUsd(fee)}/month\nNo hours logged yet`;
  }
  const rate = project.realizedRate ?? fee / hrs;
  return `${fmtUsd(fee)}/month\n~${Math.round(hrs)} hrs/mo\n${fmtUsd(Math.round(rate), { decimals: 0 })}/hr realized`;
}

function ProjectBlock({
  pos,
  label,
  variant = "project",
  title,
}: {
  pos: ReturnType<typeof monthCellPosition>;
  label?: string;
  variant?: "project" | "retainer";
  title?: string;
}) {
  const isRetainer = variant === "retainer";
  return (
    <div
      className={cn(
        "flex h-[26px] items-center justify-center overflow-hidden font-sans text-[10px] font-medium",
        isRetainer
          ? "bg-[rgba(184,134,11,0.14)] text-[#7a5c1e]"
          : "bg-success/15 text-success",
        blockRadiusClass(pos),
      )}
      title={title}
    >
      {label}
    </div>
  );
}

function SeasonBlock({
  pos,
  tone,
  title,
  exceptions,
}: {
  pos: ReturnType<typeof monthCellPosition>;
  tone: "muted" | "gold" | "amber";
  title?: string;
  exceptions: Array<{ capacity_pct: number; label: string | null }>;
}) {
  const bg =
    tone === "muted"
      ? "bg-ch/[0.06] text-muted-foreground"
      : tone === "gold"
        ? "bg-gold/12 text-gold"
        : "bg-gold/20 text-gold";

  return (
    <div
      className={cn(
        "relative flex h-[26px] items-center justify-center overflow-hidden font-sans text-[10px] font-medium",
        bg,
        blockRadiusClass(pos),
      )}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg,rgba(44,44,44,0.06),rgba(44,44,44,0.06)_2px,transparent_2px,transparent_6px)",
      }}
      title={title}
    >
      {exceptions.length > 0 && (
        <div className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
          {exceptions.slice(0, 3).map((ex, i) => (
            <span
              key={i}
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                ex.capacity_pct === 0 ? "bg-terra" : ex.capacity_pct < 50 ? "bg-gold" : "bg-ch/30",
              )}
              title={ex.label ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LifeEventBlock({
  block,
  month,
  variant,
}: {
  block: CalendarEventBlock;
  month: number;
  variant: "leave" | "reduced";
}) {
  const pos = monthCellPosition(month, block.startMonth, block.endMonth);
  const isPartial =
    block.startMonth === block.endMonth &&
    (block.startFraction > 0 || block.endFraction < 1);

  const widthPct = isPartial
    ? Math.max(10, (block.endFraction - block.startFraction) * 100)
    : 100;
  const leftPct = isPartial ? block.startFraction * 100 : 0;

  const tone =
    variant === "leave" ? "bg-gold/15 text-gold" : "bg-ch/[0.07] text-muted-foreground";

  return (
    <div
      className={cn(
        "flex h-[26px] items-center justify-center overflow-hidden font-sans text-[10px] font-medium",
        tone,
        blockRadiusClass(pos),
        isPartial ? "absolute top-0" : "relative",
      )}
      style={
        isPartial
          ? { width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }
          : undefined
      }
      title={block.event.name}
    >
      <span className="truncate px-1">{pos === "middle" ? "" : block.event.name}</span>
    </div>
  );
}

function SayNoThresholdMarker() {
  return (
    <>
      <div className="absolute bottom-0 right-0 top-0 z-[2] w-0.5 bg-success" />
      <span className="absolute -right-3.5 -top-[18px] z-[3] whitespace-nowrap rounded bg-success px-1.5 py-0.5 font-sans text-[9px] font-medium text-white">
        Say no ✓
      </span>
    </>
  );
}

function CapacitySummaryRow({
  profile,
  selectedMonth,
  onSelectMonth,
}: {
  profile: MonthCapacity[];
  selectedMonth: number | null;
  onSelectMonth: (m: number | null) => void;
}) {
  return (
    <div
      className="grid items-center bg-success/[0.03] px-3.5 py-2"
      style={{ gridTemplateColumns: GRID }}
    >
      <div className="font-sans text-[11px] text-success">Capacity</div>
      {profile.map((m) => (
        <button
          key={m.month}
          type="button"
          onClick={() => onSelectMonth(selectedMonth === m.month ? null : m.month)}
          className={cn(
            "cursor-pointer text-center font-sans text-[10px] transition-colors hover:bg-ch/[0.04] rounded",
            m.isLeave ? "text-gold" : m.isReduced ? "text-muted-foreground" : "text-success",
            selectedMonth === m.month && "ring-1 ring-gold/40 bg-white/60",
          )}
        >
          {m.isLeave ? "0" : `${Math.round(m.availableHrs)}h`}
        </button>
      ))}
    </div>
  );
}

function abbreviate(name: string, max = 12) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}
