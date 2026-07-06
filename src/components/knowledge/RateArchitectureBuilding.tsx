import { useEffect, useMemo, useState } from "react";
import type { calc } from "@/lib/finance";
import { fmtUsd } from "@/lib/finance";

type Calc = ReturnType<typeof calc>;

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "rgba(44,44,44,0.55)";

type LayerId = "foundation" | "structure" | "systems" | "envelope" | "finish";

type Layer = {
  id: LayerId;
  num: string;
  title: string;
  subtitle: string;
  color: string;
  heightUnits: number;
  perHr: number;
  paragraph: string;
  alert?: string;
};

export function RateArchitectureBuilding({ c }: { c: Calc }) {
  const aligned = c.alignedRate || 0;
  const be = c.breakEvenRate || 0;
  const hpw = c.targetBillableHrsWeek || 0;
  const available = 40; // reasonable default; if firm_config exposes this we could pass in
  const utilization = available > 0 ? Math.min(1, hpw / available) : 0;

  const perHr = c.perHour;

  const envelopeColor =
    utilization < 0.4 ? TERRA : utilization <= 0.6 ? GOLD : SAGE;

  const layers: Layer[] = useMemo(
    () => [
      {
        id: "foundation",
        num: "01",
        title: "Foundation",
        subtitle: "What you need to pay yourself",
        color: "#2C2C2C",
        heightUnits: Math.max(1, perHr.comp),
        perHr: perHr.comp,
        paragraph:
          "This is the base everything else sits on. Before your firm can cover a single expense or carry a single team member, it has to cover what you need to live. Get this wrong and nothing above it holds.",
      },
      {
        id: "structure",
        num: "02",
        title: "Structure",
        subtitle: "What it costs to run the firm",
        color: "#4A3F35",
        heightUnits: Math.max(1, perHr.opexRecurring + perHr.opexOneTime),
        perHr: perHr.opexRecurring + perHr.opexOneTime,
        paragraph:
          "The walls and systems that keep the firm standing — software, insurance, subscriptions, rent. Fixed costs. They exist whether you bill 10 hours this week or 40. Every hour you don't bill, these still run.",
        alert:
          "Every software subscription you add raises this layer — and raises the rate you need to charge. That $99/mo tool? It adds $1,188/yr to your cost floor.",
      },
      {
        id: "systems",
        num: "03",
        title: "Systems",
        subtitle: "What your team actually costs",
        color: "#3D4A3F",
        heightUnits: Math.max(0.6, (c.teamCostTotal / Math.max(1, c.annualBillableHrs)) || 0.6),
        perHr: c.teamCostTotal / Math.max(1, c.annualBillableHrs),
        paragraph:
          "Each person you add raises the load this building has to carry. Not just their wage — their taxes, benefits, and equipment too. The fully burdened cost is what your rate has to cover, not just what shows on a paycheck.",
        alert:
          "Adding one team member raises this layer directly — you need to charge more per hour, or bill more hours, to carry the additional weight.",
      },
      {
        id: "envelope",
        num: "04",
        title: "The Envelope",
        subtitle: "How many hours you actually bill",
        color: envelopeColor,
        heightUnits: 2 + utilization * 3,
        perHr: 0,
        paragraph:
          "A building that sits half-empty still costs the same to maintain. So does your firm. The fewer hours you bill — to non-billable admin, to unbilled client contact, to scope creep — the more each billed hour has to carry.",
        alert: `At ${Math.round(utilization * 100)}% utilization, raising billable hours drops your aligned rate — with the same cost floor.`,
      },
      {
        id: "finish",
        num: "05",
        title: "The Finish",
        subtitle: "Margin — what makes growth possible",
        color: "#8B6914",
        heightUnits: Math.max(0.8, perHr.marginAtFloor + perHr.marginAbove),
        perHr: aligned - be,
        paragraph:
          "You can't finish a building that isn't structurally complete. Margin is what's left after every layer below is covered. It's not a bonus — it's how the firm funds slow months, equipment, future hires, and your next chapter.",
        alert:
          c.billedRate < be
            ? `Your billed rate of ${fmtUsd(c.billedRate, { decimals: 0 })}/hr is ${fmtUsd(be - c.billedRate, { decimals: 0 })}/hr below break-even — before margin is even considered. The structure is sound. The finish hasn't been applied.`
            : undefined,
      },
    ],
    [aligned, be, c.annualBillableHrs, c.billedRate, c.teamCostTotal, envelopeColor, perHr, utilization],
  );

  const totalUnits = layers.reduce((s, l) => s + l.heightUnits, 0);
  const TOTAL_HEIGHT = 480;

  const [visibleCount, setVisibleCount] = useState(0);
  const [selected, setSelected] = useState<LayerId>("foundation");

  useEffect(() => {
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= layers.length; i++) {
      timers.push(setTimeout(() => setVisibleCount(i), i * 300));
    }
    return () => timers.forEach(clearTimeout);
  }, [layers.length]);

  const replay = () => setVisibleCount(0);

  useEffect(() => {
    if (visibleCount === 0) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i <= layers.length; i++) {
        timers.push(setTimeout(() => setVisibleCount(i), i * 300));
      }
      return () => timers.forEach(clearTimeout);
    }
  }, [visibleCount, layers.length]);

  const selectedIdx = layers.findIndex((l) => l.id === selected);
  const selectedLayer = layers[selectedIdx];
  const allBuilt = visibleCount >= layers.length;

  return (
    <div className="grid md:grid-cols-[minmax(280px,420px)_1fr] gap-8" style={{ fontFamily: "Jost, sans-serif" }}>
      {/* Building column */}
      <div>
        <div
          className="relative"
          style={{
            height: TOTAL_HEIGHT + 40,
            padding: "20px 40px 20px 60px",
          }}
        >
          {/* $ axis */}
          <div className="absolute left-0 top-5 bottom-10 flex flex-col justify-between" style={{ fontSize: 9, color: MUTED }}>
            <span style={{ color: allBuilt ? GOLD : MUTED, fontWeight: 500 }}>
              {allBuilt ? `${fmtUsd(aligned, { decimals: 0 })}/hr ← your floor` : ""}
            </span>
            <span>{fmtUsd(be, { decimals: 0 })}</span>
            <span>$0</span>
          </div>

          {/* Stack */}
          <div className="relative h-full flex flex-col justify-end">
            {layers
              .slice()
              .reverse()
              .map((layer, iFromTop) => {
                const originalIdx = layers.length - 1 - iFromTop;
                const isVisible = originalIdx < visibleCount;
                const heightPct = (layer.heightUnits / totalUnits) * 100;
                const isSelected = selected === layer.id;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setSelected(layer.id)}
                    style={{
                      width: "100%",
                      background: layer.color,
                      height: `${heightPct}%`,
                      borderTop: layer.id === "finish" ? `2px solid ${GOLD}` : "none",
                      outline: isSelected ? `2px solid ${GOLD}` : "none",
                      outlineOffset: -2,
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? "translateY(0)" : "translateY(12px)",
                      transition: "opacity 300ms ease, transform 300ms ease",
                      color: "white",
                      padding: "6px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ fontSize: 9, letterSpacing: "0.16em", opacity: 0.7 }}>
                        {layer.num} · {layer.title}
                      </span>
                      {layer.perHr > 0 && (
                        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14 }}>
                          {fmtUsd(layer.perHr, { decimals: 0 })}/hr
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Ground line */}
          <div style={{ borderTop: `1px solid ${CHARCOAL}`, marginTop: 0, marginLeft: 60, marginRight: 40 }} />
          <div style={{ textAlign: "center", fontSize: 9, color: MUTED, marginTop: 4, marginLeft: 60, marginRight: 40 }}>
            Ground floor
          </div>
        </div>

        <button
          type="button"
          onClick={replay}
          style={{ fontSize: 10, color: GOLD, marginTop: 8 }}
          className="hover:underline"
        >
          How this was built →
        </button>
      </div>

      {/* Detail column */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>
          Layer {selectedLayer.num}
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 32,
            color: CHARCOAL,
            marginTop: 2,
            lineHeight: 1.1,
          }}
        >
          {selectedLayer.title}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{selectedLayer.subtitle}</div>

        <p style={{ fontSize: 14, color: CHARCOAL, lineHeight: 1.7, marginTop: 20, fontWeight: 300 }}>
          {selectedLayer.paragraph}
        </p>

        {selectedLayer.perHr > 0 && (
          <div style={{ marginTop: 18, padding: "12px 16px", background: "rgba(184,134,11,0.06)", borderLeft: `2px solid ${GOLD}`, borderRadius: "0 4px 4px 0" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
              Per-hour contribution
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL, marginTop: 2 }}>
              {fmtUsd(selectedLayer.perHr, { decimals: 0 })}/hr
            </div>
          </div>
        )}

        {selectedLayer.alert && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(196,113,74,0.06)", borderLeft: `2px solid ${TERRA}`, fontSize: 12, color: CHARCOAL, borderRadius: "0 4px 4px 0", fontWeight: 300, lineHeight: 1.6 }}>
            {selectedLayer.alert}
          </div>
        )}

        {/* Prev / next + dots */}
        <div className="flex items-center justify-between" style={{ marginTop: 22 }}>
          <button
            type="button"
            onClick={() => setSelected(layers[Math.max(0, selectedIdx - 1)].id)}
            disabled={selectedIdx === 0}
            style={{ fontSize: 11, color: GOLD, opacity: selectedIdx === 0 ? 0.3 : 1 }}
            className="hover:underline"
          >
            ← Previous
          </button>
          <div className="flex gap-2">
            {layers.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l.id)}
                aria-label={l.title}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: l.id === selected ? GOLD : "rgba(44,44,44,0.15)",
                  border: "none",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelected(layers[Math.min(layers.length - 1, selectedIdx + 1)].id)}
            disabled={selectedIdx === layers.length - 1}
            style={{ fontSize: 11, color: GOLD, opacity: selectedIdx === layers.length - 1 ? 0.3 : 1 }}
            className="hover:underline"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}