import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  getPinterestBoardsForFirm,
  getPinterestConnectUrl,
  getPinterestPinsForFirm,
  saveFirmMilestone,
  saveFirmVision,
  togglePinterestBoardSelection,
  updateFirmGoalStatus,
  type FirmMilestoneRow,
  type FirmVisionClient,
} from "@/lib/goals.functions";
import type { FirmGoalRow, GoalInsight, GoalInsightsMap } from "@/lib/goals";
import {
  currentQuarterLabel,
  previousQuarterLabel,
} from "@/lib/goals";
import { fmtUsd } from "@/lib/finance";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GoalFormModal, type GoalFormValues } from "./GoalFormModal";
import { VisionBoardUploadDialog } from "./VisionBoardUploadDialog";
import { saveFirmGoal } from "@/lib/goals.functions";

const FOCUS_SUGGESTIONS = [
  "Spaciousness",
  "Momentum",
  "Intentional",
  "Grounded",
  "Expansive",
  "Selective",
  "Presence",
  "Ease",
];

const STATUS_DOT: Record<string, string> = {
  achieved: "bg-success",
  on_track: "bg-gold",
  watch: "bg-terra",
  no_data: "bg-muted-lt",
};

const NUMBER_COLOR: Record<string, string> = {
  sage: "text-success",
  gold: "text-gold",
  terra: "text-terra",
};

type Props = {
  firmName: string;
  vision: FirmVisionClient;
  goals: FirmGoalRow[];
  milestones: FirmMilestoneRow[];
  insights: GoalInsightsMap;
  onAddGoal: () => void;
  goalModalOpen: boolean;
  setGoalModalOpen: (v: boolean) => void;
  editingGoal: FirmGoalRow | null;
  setEditingGoal: (g: FirmGoalRow | null) => void;
};

export function FutureVision({
  firmName,
  vision,
  goals,
  milestones,
  insights,
  goalModalOpen,
  setGoalModalOpen,
  editingGoal,
  setEditingGoal,
}: Props) {
  const reviewRef = useRef<HTMLDivElement>(null);
  const [goalFormTimeframe, setGoalFormTimeframe] = useState<
    "this_year" | "next_year" | "someday"
  >("this_year");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState(vision.anchor_statement ?? "");
  const [focusDraft, setFocusDraft] = useState(vision.quarterly_focus_word ?? "");
  const [reviewDraft, setReviewDraft] = useState(vision.quarterly_review_note ?? "");
  const [milestoneName, setMilestoneName] = useState("");

  const qc = useQueryClient();
  const saveVisionFn = useServerFn(saveFirmVision);
  const saveGoalFn = useServerFn(saveFirmGoal);
  const statusFn = useServerFn(updateFirmGoalStatus);
  const milestoneFn = useServerFn(saveFirmMilestone);
  const boardsFn = useServerFn(getPinterestBoardsForFirm);
  const pinsFn = useServerFn(getPinterestPinsForFirm);
  const connectFn = useServerFn(getPinterestConnectUrl);
  const toggleBoardFn = useServerFn(togglePinterestBoardSelection);

  const boardIds = vision.selected_board_ids ?? [];
  const { data: boards = [] } = useQuery({
    queryKey: ["pinterest-boards"],
    queryFn: () => boardsFn(),
    enabled: vision.pinterest_connected,
  });

  const { data: pins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["pinterest-pins", boardIds.join(",")],
    queryFn: () => pinsFn({ data: { boardIds, limit: 24 } }),
    enabled: vision.pinterest_connected && boardIds.length > 0,
  });

  const mosaicImages = useMemo(() => {
    if (pins.length) return pins.map((p) => ({ url: p.imageUrl, href: p.pinUrl }));
    const uploaded = vision.uploaded_images?.length
      ? vision.uploaded_images
      : (vision.uploaded_image_urls ?? []).map((url) => ({ path: url, url }));
    return uploaded.map((u) => ({ url: u.url, href: u.url }));
  }, [pins, vision.uploaded_images, vision.uploaded_image_urls]);

  const filteredGoals = goals.filter((g) => g.timeframe === "this_year");

  const thisYearGoalKeys = useMemo(
    () =>
      new Set(
        goals
          .filter((g) => g.timeframe === "this_year")
          .map(
            (g) =>
              `${g.name.trim().toLowerCase()}|${g.target_date?.slice(0, 10) ?? ""}`,
          ),
      ),
    [goals],
  );

  const horizonRows = useMemo(() => {
    type Row =
      | {
          kind: "goal";
          id: string;
          name: string;
          target_date: string | null;
          timeframe: string;
          sortDate: string;
        }
      | {
          kind: "milestone";
          id: string;
          name: string;
          target_date: string | null;
          detail: string | null;
          milestone_type: string;
          status: string;
          sortDate: string;
        };

    const rows: Row[] = [];

    for (const g of goals.filter(
      (x) => x.timeframe === "next_year" || x.timeframe === "someday",
    )) {
      rows.push({
        kind: "goal",
        id: g.id,
        name: g.name,
        target_date: g.target_date,
        timeframe: g.timeframe,
        sortDate: g.target_date ?? (g.timeframe === "someday" ? "9999-12-31" : "9998-12-31"),
      });
    }

    for (const m of milestones) {
      if (m.linked_goal_id) {
        const linked = goals.find((g) => g.id === m.linked_goal_id);
        if (linked?.timeframe === "this_year") continue;
      }
      const key = `${m.name.trim().toLowerCase()}|${m.target_date?.slice(0, 10) ?? ""}`;
      if (thisYearGoalKeys.has(key)) continue;
      rows.push({
        kind: "milestone",
        id: m.id,
        name: m.name,
        target_date: m.target_date,
        detail: m.detail,
        milestone_type: m.milestone_type,
        status: m.status,
        sortDate: m.target_date ?? "9999-12-31",
      });
    }

    rows.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    return rows;
  }, [goals, milestones, thisYearGoalKeys]);

  const saveVision = useMutation({
    mutationFn: (patch: Parameters<typeof saveVisionFn>[0]["data"]) =>
      saveVisionFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["future"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGoal = useMutation({
    mutationFn: (v: GoalFormValues) => saveGoalFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["future"] });
      setGoalModalOpen(false);
      setEditingGoal(null);
      toast.success("Goal saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connectPinterest = async () => {
    try {
      const { url } = await connectFn();
      toast.message(
        "Pinterest requires a developer app approved by Pinterest (often several days). Upload images works today without OAuth.",
        { duration: 6000 },
      );
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start Pinterest connect";
      toast.error(msg);
      toast.message("Use Upload images on the vision board until Pinterest OAuth is approved.", {
        duration: 5000,
      });
    }
  };

  const primaryActionLabel = (insight: GoalInsight) => {
    switch (insight.primaryAction) {
      case "income":
        return "Model the gap →";
      case "team":
        return "See full hire analysis →";
      case "min_fee":
        return "Review projects →";
      case "hours":
        return "See capacity →";
      default:
        return null;
    }
  };

  const primaryActionTo = (action: GoalInsight["primaryAction"]) => {
    if (action === "hours") return { to: "/capacity" as const };
    if (action === "min_fee") return { to: "/sightline" as const };
    if (action === "team" || action === "income") {
      return {
        to: "/future" as const,
        search: { tab: "roadmap" as const, roadmapTab: "planning" as const },
      };
    }
    return { to: "/future" as const };
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-cream">
        <div className="grid grid-cols-6 grid-rows-[180px_120px] gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => {
            const cellClass =
              i === 0
                ? "col-span-2 row-span-2"
                : i === 7
                  ? "col-span-2"
                  : "";
            const img = mosaicImages[i];
            return (
              <div
                key={i}
                className={cn("relative bg-ch/5", cellClass)}
                style={
                  img
                    ? {
                        backgroundImage: `url(${img.url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                {pinsLoading && vision.pinterest_connected && (
                  <div className="absolute inset-0 animate-pulse bg-cream/60" />
                )}
                {!img && !pinsLoading && (
                  <div className="flex h-full items-center justify-center opacity-30">
                    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
                      <rect x="8" y="8" width="14" height="14" fill="currentColor" className="text-ch" />
                      <circle cx="34" cy="14" r="8" fill="currentColor" className="text-ch" />
                      <path d="M8 28h32v12H8z" fill="currentColor" className="text-ch" />
                    </svg>
                  </div>
                )}
                {img?.href && (
                  <a
                    href={img.href}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0"
                    aria-label="Open inspiration"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto max-w-[380px] rounded-[10px] bg-cream/90 px-6 py-4 text-center backdrop-blur-[2px]">
            <p className="mb-1.5 font-sans text-[10px] uppercase tracking-[0.08em] text-muted-lt">
              My firm exists to give me
            </p>
            {vision.anchor_statement ? (
              <>
                <p className="font-display text-[17px] italic leading-snug text-ch">
                  &ldquo;{vision.anchor_statement}&rdquo;
                </p>
                <button
                  type="button"
                  className="mt-1.5 font-sans text-[10px] text-muted-lt underline"
                  onClick={() => {
                    setAnchorDraft(vision.anchor_statement ?? "");
                    setAnchorOpen(true);
                  }}
                >
                  Edit
                </button>
              </>
            ) : (
              <button
                type="button"
                className="font-display text-[15px] italic text-muted-lt"
                onClick={() => setAnchorOpen(true)}
              >
                What do you want this firm to give you five years from now?
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 font-sans text-[11px] text-muted-lt">
            {vision.pinterest_connected ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-pinterest" />
                  Pinterest ·
                </span>
                {boards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      toggleBoardFn({
                        data: { boardId: b.id, selected: !b.isSelected },
                      }).then(() => qc.invalidateQueries({ queryKey: ["future", "pinterest"] }))
                    }
                    className={cn(
                      "rounded-full px-2.5 py-0.5",
                      b.isSelected ? "bg-pinterest text-white" : "bg-cream text-ch/70",
                    )}
                  >
                    {b.name}
                  </button>
                ))}
              </>
            ) : (
              <>
                Connect Pinterest to pull in your boards{" "}
                <button type="button" className="text-pinterest" onClick={() => void connectPinterest()}>
                  Connect →
                </button>
              </>
            )}
          </div>
          <div className="flex gap-3 font-sans text-[11px]">
            <button type="button" className="text-gold" onClick={() => setUploadOpen(true)}>
              Upload images
            </button>
            <button type="button" className="text-muted-lt" onClick={() => setAnchorOpen(true)}>
              Edit statement
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6 flex items-center gap-4 border-y border-border bg-ch/[0.03] py-4">
        <p className="w-[100px] shrink-0 font-sans text-[10px] uppercase tracking-[0.1em] text-muted-lt">
          {currentQuarterLabel().replace(/^Q(\d+ \d+)/, "Q$1 focus word")}
        </p>
        <div className="flex-1">
          {vision.quarterly_focus_word ? (
            <>
              <p className="font-display text-2xl text-ch">{vision.quarterly_focus_word}</p>
              <p className="mt-0.5 font-sans text-[11px] text-ch/65">
                The quality you want to feel more of this quarter
              </p>
            </>
          ) : (
            <button
              type="button"
              className="font-display text-[15px] italic text-muted-lt"
              onClick={() => setFocusOpen(true)}
            >
              Set a focus word for this quarter →
            </button>
          )}
        </div>
        {vision.quarterly_focus_word && (
          <button type="button" className="font-sans text-[11px] text-gold underline" onClick={() => setFocusOpen(true)}>
            Change →
          </button>
        )}
      </section>

      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-ch/60">This year&apos;s goals</p>
        <button
          type="button"
          className="font-sans text-[11px] text-gold"
          onClick={() => {
            setEditingGoal(null);
            setGoalFormTimeframe("this_year");
            setGoalModalOpen(true);
          }}
        >
          + Add goal
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {filteredGoals.map((g) => {
          const insight = insights[g.id];
          const open = expanded[g.id];
          const dateLabel = g.target_date
            ? new Date(g.target_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
            : "Ongoing";
          return (
            <div key={g.id} className="overflow-hidden rounded-xl border border-border bg-white">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_DOT[insight?.status ?? "no_data"])} />
                <span className="flex-1 font-sans text-sm font-medium text-ch">{g.name}</span>
                <span className="whitespace-nowrap font-sans text-[11px] text-ch/60">{dateLabel}</span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 text-muted-lt transition-transform", open && "rotate-180")}
                />
              </button>
              {open && insight && (
                <div className="border-t border-border px-4 py-3.5">
                  <p className="mb-2.5 font-display text-[13px] italic leading-relaxed text-ch/70">
                    {insight.insightSentence}
                  </p>
                  {insight.numberCards.length > 0 && (
                    <div className="mb-3 grid grid-cols-3 gap-2">
                      {insight.numberCards.map((c) => (
                        <div key={c.label} className="rounded-lg bg-cream px-3 py-2.5">
                          <p className="font-sans text-[10px] text-ch/60">{c.label}</p>
                          <p className={cn("font-display text-lg", NUMBER_COLOR[c.color ?? ""] ?? "text-ch")}>
                            {c.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {primaryActionLabel(insight) && (
                      <Link
                        {...primaryActionTo(insight.primaryAction)}
                        className="rounded-md bg-ch px-3.5 py-1.5 font-sans text-[11px] font-medium text-cream"
                      >
                        {primaryActionLabel(insight)!}
                      </Link>
                    )}
                    <button
                      type="button"
                      className="rounded-md border border-border px-3.5 py-1.5 font-sans text-[11px]"
                      onClick={() => {
                        setEditingGoal(g);
                        setGoalModalOpen(true);
                      }}
                    >
                      Edit goal
                    </button>
                    {g.status !== "achieved" && (
                      <button
                        type="button"
                        className="font-sans text-[11px] text-muted-lt underline"
                        onClick={() =>
                          statusFn({ data: { id: g.id, status: "achieved" } }).then(() =>
                            qc.invalidateQueries({ queryKey: ["future"] }),
                          )
                        }
                      >
                        Mark achieved
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredGoals.length === 0 && (
          <p className="py-6 text-center font-display text-sm italic text-ch/60">
            No goals set for this year yet. What do you want your firm to do for you in {new Date().getFullYear()}?
          </p>
        )}
      </div>

      <div className="mt-8">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-ch/60">On the horizon</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="font-sans text-[11px] text-gold"
              onClick={() => {
                setEditingGoal(null);
                setGoalFormTimeframe("next_year");
                setGoalModalOpen(true);
              }}
            >
              + Add future goal
            </button>
            <button type="button" className="font-sans text-[11px] text-gold" onClick={() => setMilestoneOpen(true)}>
              Add milestone
            </button>
          </div>
        </div>
        <p className="mb-3 font-sans text-[12px] text-ch/65">
          Next year, someday, and dated milestones — not what you&apos;re working on this year.
        </p>
        <div className="relative border-l border-border pl-5">
          {horizonRows.length === 0 ? (
            <p className="py-4 font-sans text-[13px] italic text-ch/60">
              Nothing on the horizon yet. Add a next-year goal or a milestone when you&apos;re
              planning a hire, a revenue threshold, or a longer-term shift.
            </p>
          ) : (
            horizonRows.map((row) => (
              <div key={`${row.kind}-${row.id}`} className="relative mb-4">
                <span
                  className={cn(
                    "absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border border-border bg-white",
                    row.kind === "milestone" && row.status === "achieved" && "border-success bg-success",
                    row.kind === "milestone" && row.status === "active" && "border-gold bg-gold",
                    row.kind === "milestone" &&
                      row.milestone_type === "directional" &&
                      "border-dashed",
                    row.kind === "goal" && "border-gold/80 bg-gold/20",
                  )}
                />
                <div className="rounded-[10px] border border-border bg-white px-3.5 py-2.5">
                  <p className="font-sans text-[10px] uppercase tracking-wide text-ch/60">
                    {row.target_date
                      ? new Date(row.target_date).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : row.kind === "goal" && row.timeframe === "someday"
                        ? "Someday"
                        : "TBD"}
                    {row.kind === "goal" ? ` · ${row.timeframe === "next_year" ? "Next year" : "Someday"}` : ""}
                  </p>
                  <p className="font-sans text-[13px] font-medium text-ch">{row.name}</p>
                  {row.kind === "milestone" && row.detail && (
                    <p className="font-sans text-[11px] text-ch/60">{row.detail}</p>
                  )}
                  {row.kind === "goal" && (
                    <button
                      type="button"
                      className="mt-1 font-sans text-[11px] text-ch/60 underline hover:text-ch"
                      onClick={() => {
                        const g = goals.find((x) => x.id === row.id);
                        if (g) {
                          setEditingGoal(g);
                          setGoalModalOpen(true);
                        }
                      }}
                    >
                      Edit goal
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        ref={reviewRef}
        className="mt-10 rounded-xl border border-success/20 bg-success/5 px-5 py-4"
      >
        <p className="font-sans text-[11px] font-medium text-success">
          {previousQuarterLabel()} in review
        </p>
        <h3 className="mt-1 font-display text-[15px] text-ch">Close the loop on last quarter</h3>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ch/70">
          Look at your goals above — what moved, what stalled, and what do you want to feel different
          this quarter? You don&apos;t need to repeat them here; this is your private reflection.
        </p>
        <p className="mt-4 font-display text-[13px] italic text-ch/75">
          What&apos;s the one thing you want your firm to give you this quarter?
        </p>
        <Textarea
          className="mt-2 border-border bg-white font-display text-sm italic text-ch placeholder:text-ch/45"
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          placeholder="Write whatever comes to mind..."
        />
        <Button
          className="mt-3"
          size="sm"
          onClick={() =>
            saveVision.mutate({
              quarterly_review_note: reviewDraft,
              quarterly_focus_word: focusDraft || vision.quarterly_focus_word,
              quarterly_focus_quarter: currentQuarterLabel(),
            })
          }
        >
          Set {currentQuarterLabel()} focus →
        </Button>
      </div>

      <Dialog open={anchorOpen} onOpenChange={setAnchorOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-normal">
              What do you want this firm to give you?
            </DialogTitle>
          </DialogHeader>
          <p className="font-sans text-xs italic text-ch/65">
            Write in your own words. There&apos;s no right answer — just yours.
          </p>
          <Textarea
            rows={4}
            className="font-display text-[15px] italic"
            value={anchorDraft}
            onChange={(e) => setAnchorDraft(e.target.value)}
          />
          <Button onClick={() => saveVision.mutate({ anchor_statement: anchorDraft.trim() || null })}>
            Save →
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={focusOpen} onOpenChange={setFocusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Your focus word</DialogTitle>
          </DialogHeader>
          <InputLikeFocus
            value={focusDraft}
            onChange={setFocusDraft}
            suggestions={FOCUS_SUGGESTIONS}
            quarter={currentQuarterLabel()}
            onSave={() =>
              saveVision.mutate({
                quarterly_focus_word: focusDraft.trim(),
                quarterly_focus_quarter: currentQuarterLabel(),
              })
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add milestone</DialogTitle>
          </DialogHeader>
          <input
            className="w-full rounded-md border border-border px-3 py-2"
            value={milestoneName}
            onChange={(e) => setMilestoneName(e.target.value)}
            placeholder="Milestone name"
          />
          <Button
            onClick={() =>
              milestoneFn({
                data: { name: milestoneName.trim(), milestone_type: "directional" },
              }).then(() => {
                setMilestoneName("");
                setMilestoneOpen(false);
                qc.invalidateQueries({ queryKey: ["future"] });
              })
            }
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>

      <VisionBoardUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        images={vision.uploaded_images ?? []}
      />

      <GoalFormModal
        open={goalModalOpen}
        onOpenChange={setGoalModalOpen}
        initial={editingGoal}
        defaultTimeframe={editingGoal ? undefined : goalFormTimeframe}
        onSave={(v) => saveGoal.mutate(v)}
        saving={saveGoal.isPending}
      />
    </div>
  );
}

function InputLikeFocus({
  value,
  onChange,
  suggestions,
  quarter,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  quarter: string;
  onSave: () => void;
}) {
  return (
    <div>
      <input
        className="w-full border-b border-border py-2 font-display text-2xl outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Spaciousness..."
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-full border border-border px-2 py-0.5 font-sans text-[11px] text-ch/70"
            onClick={() => onChange(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="mt-3 font-sans text-[11px] text-muted-lt">This sets your focus for {quarter}</p>
      <Button className="mt-4" onClick={onSave}>
        Set focus →
      </Button>
    </div>
  );
}

export function FutureVisionHeaderActions({
  onReview,
  onAddGoal,
}: {
  onReview: () => void;
  onAddGoal: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="rounded-md border border-border px-3 py-1.5 font-sans text-xs text-ch"
        onClick={onReview}
      >
        Q3 review
      </button>
      <button
        type="button"
        className="rounded-md bg-ch px-3 py-1.5 font-sans text-xs font-medium text-cream"
        onClick={onAddGoal}
      >
        + Add goal
      </button>
    </div>
  );
}
