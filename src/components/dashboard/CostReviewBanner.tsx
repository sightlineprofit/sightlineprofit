import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, RefreshCw, X } from "lucide-react";
import { confirmCostReviewUnchanged } from "@/lib/firm.functions";
import {
  parseCostReviewDate,
  shouldShowAnnualReview,
  shouldShowQuarterlyReview,
} from "@/lib/cost-review.utils";
import { showCostReviewConfirmedToast } from "@/lib/cost-review-notifications";

const SESSION_SHOWN_KEY = "sightline-cost-review-quarterly-shown";

type FirmPreferences = {
  last_cost_review_date?: string | null;
} | null | undefined;

export function CostReviewBanner({ firmPreferences }: { firmPreferences: FirmPreferences }) {
  const confirm = useServerFn(confirmCostReviewUnchanged);
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const lastReview = parseCostReviewDate(firmPreferences?.last_cost_review_date);
  const isJanuary = new Date().getMonth() === 0;
  const showAnnual = isJanuary && shouldShowAnnualReview(lastReview);
  const showQuarterly = !showAnnual && shouldShowQuarterlyReview(lastReview);

  /** Lock visibility for this mount so setting sessionStorage does not hide the banner mid-view. */
  const visibilityLocked = useRef(false);
  const [bannerKind, setBannerKind] = useState<"annual" | "quarterly" | null>(null);

  useEffect(() => {
    if (visibilityLocked.current || dismissed || confirmed) return;
    if (showAnnual) {
      visibilityLocked.current = true;
      setBannerKind("annual");
      return;
    }
    if (showQuarterly) {
      const alreadyShown =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
      if (alreadyShown) {
        visibilityLocked.current = true;
        setBannerKind(null);
        return;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
      }
      visibilityLocked.current = true;
      setBannerKind("quarterly");
    }
  }, [showAnnual, showQuarterly, dismissed, confirmed]);

  const visible = !dismissed && !confirmed && bannerKind !== null;

  if (!visible) return null;

  async function onNothingChanged() {
    setConfirmed(true);
    try {
      await confirm();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      showCostReviewConfirmedToast();
    } catch {
      setConfirmed(false);
    }
  }

  function onDismiss() {
    setDismissed(true);
  }

  if (bannerKind === "annual") {
    const year = new Date().getFullYear();
    return (
      <div
        className="relative mb-4 flex items-center justify-between gap-3 rounded-r-lg py-3.5 pl-[18px] pr-4"
        style={{
          background: "rgba(44,44,44,0.04)",
          borderLeft: "2px solid var(--ch)",
        }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-ch" aria-hidden />
          <div>
            <div className="font-sans text-[13px] font-medium text-ch">
              Start {year} with accurate numbers
            </div>
            <div className="mt-0.5 font-sans text-[12px] text-muted-foreground">
              Your aligned rate is built from your costs. Before you quote new projects this year,
              confirm nothing has changed.
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onNothingChanged}
            className="cursor-pointer font-sans text-[12px] text-muted-lt underline"
          >
            My costs haven&apos;t changed →
          </button>
          <Link
            to="/settings"
            search={{ panel: "comp" }}
            className="cursor-pointer rounded-md px-3.5 py-1.5 font-sans text-[12px] font-medium text-white"
            style={{ background: "var(--ch)" }}
          >
            Review and confirm →
          </Link>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-lt">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative mb-4 flex items-center justify-between gap-3 rounded-r-lg px-4 py-3"
      style={{
        background: "rgba(184,134,11,0.06)",
        borderLeft: "2px solid var(--gold)",
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <div>
          <div className="font-sans text-[13px] font-medium text-ch">Time for a quick check-in</div>
          <div className="mt-0.5 font-sans text-[12px] text-muted-foreground">
            It&apos;s been a while since you reviewed your cost structure. Has anything changed?
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onNothingChanged}
          className="cursor-pointer font-sans text-[12px] text-muted-lt underline"
        >
          Nothing changed →
        </button>
        <Link
          to="/settings"
          search={{ panel: "comp" }}
          className="cursor-pointer rounded-md border border-gold bg-white px-3.5 py-1.5 font-sans text-[12px] font-medium text-gold"
          style={{ borderWidth: "0.5px" }}
        >
          Review my costs →
        </Link>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-lt">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
