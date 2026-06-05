import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getProjectCloseSummary } from "@/lib/value-moments.functions";
import { fmtUsd, fmtPct } from "@/lib/finance";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ProjectCloseSummary({
  projectId,
  open,
  onClose,
  onConfirm,
  onViewBreakdown,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onViewBreakdown: () => void;
}) {
  const fn = useServerFn(getProjectCloseSummary);
  const { data } = useQuery({
    queryKey: ["project-close-summary", projectId],
    queryFn: () => fn({ data: { projectId } }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-cream border-border">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400 }}
            className="text-ch tracking-tight"
          >
            {data ? `${data.projectName} — summary` : "Project summary"}
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-sm text-ch/50 py-6">Loading…</div>
        ) : (
          <>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.15em] text-ch/50">
                  <th className="text-left py-2"></th>
                  <th className="text-right py-2 font-normal">Planned</th>
                  <th className="text-right py-2 font-normal">Actual</th>
                  <th className="text-right py-2 font-normal">Variance</th>
                </tr>
              </thead>
              <tbody className="text-ch">
                <Row
                  label="Fee"
                  planned={fmtUsd(data.plannedFee)}
                  actual={fmtUsd(data.actualFee)}
                  variance={data.isFixedFee ? "—" : fmtUsd(data.actualFee - data.plannedFee)}
                />
                <Row
                  label="Hours"
                  planned={`${data.plannedHrs.toFixed(1)} hrs`}
                  actual={`${data.actualHrs.toFixed(1)} hrs`}
                  variance={`${data.actualHrs - data.plannedHrs >= 0 ? "+" : ""}${(data.actualHrs - data.plannedHrs).toFixed(1)} hrs`}
                  varianceTone={data.actualHrs > data.plannedHrs ? "terra" : "success"}
                />
                <Row
                  label="Effective rate"
                  planned={`${fmtUsd(data.plannedRate)}/hr`}
                  actual={`${fmtUsd(data.actualRate)}/hr`}
                  variance={`${fmtUsd(data.actualRate - data.plannedRate)}/hr`}
                  varianceTone={data.actualRate < data.plannedRate ? "terra" : "success"}
                />
                <Row
                  label="Margin"
                  planned={fmtPct(data.plannedMarginPct)}
                  actual={fmtPct(data.actualMarginPct)}
                  variance={`${data.actualMarginPct >= data.plannedMarginPct ? "+" : ""}${(data.actualMarginPct - data.plannedMarginPct).toFixed(1)} pp`}
                  varianceTone={data.actualMarginPct < data.plannedMarginPct ? "terra" : "success"}
                />
              </tbody>
            </table>

            {data.overHrs > 0 ? (
              <p className="mt-5 text-sm text-terra leading-relaxed">
                The {data.overHrs.toFixed(1)} unscoped hours represent {fmtUsd(data.overCost)} in time cost not recovered by the project fee.
              </p>
            ) : (
              <p className="mt-5 text-sm text-success leading-relaxed">
                This project delivered within scope. You protected your margin.
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={onViewBreakdown}
                className="text-sm text-ch/70 hover:text-ch underline-offset-4 hover:underline"
              >
                View full breakdown
              </button>
              <button
                onClick={onConfirm}
                className="rounded bg-gold text-white text-sm font-medium px-4 py-2 hover:bg-goldl"
              >
                Close project
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  planned,
  actual,
  variance,
  varianceTone,
}: {
  label: string;
  planned: string;
  actual: string;
  variance: string;
  varianceTone?: "terra" | "success";
}) {
  return (
    <tr className="border-t border-border/60">
      <td className="py-2.5 text-ch/70">{label}</td>
      <td className="py-2.5 text-right num">{planned}</td>
      <td className="py-2.5 text-right num">{actual}</td>
      <td
        className={cn(
          "py-2.5 text-right num",
          varianceTone === "terra" && "text-terra",
          varianceTone === "success" && "text-success",
        )}
      >
        {variance}
      </td>
    </tr>
  );
}