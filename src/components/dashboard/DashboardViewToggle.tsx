import { useEffect, useRef, useState } from "react";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.12)";

export type DashboardView = "revenue_architecture" | "aligned_rate";

const VIEWS: Array<{ value: DashboardView; label: string }> = [
  { value: "revenue_architecture", label: "Revenue view" },
  { value: "aligned_rate", label: "Rate view" },
];

const PREFS: Array<{ value: DashboardView; title: string; sub: string }> = [
  { value: "revenue_architecture", title: "Revenue view", sub: "What your firm needs to generate" },
  { value: "aligned_rate", title: "Rate view", sub: "Aligned rate and per-hour breakdown" },
];

export function DashboardViewToggle({
  currentView,
  onViewChange,
}: {
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [popoverOpen]);

  const selectView = (view: DashboardView) => {
    onViewChange(view);
    setPopoverOpen(false);
  };

  return (
    <div className="mb-4 flex items-center justify-between">
      <div
        className="inline-flex"
        style={{
          background: CREAM,
          border: `0.5px solid ${BORDER}`,
          borderRadius: 20,
          padding: 3,
        }}
      >
        {VIEWS.map((v) => {
          const active = currentView === v.value;
          return (
            <button
              key={v.value}
              type="button"
              onClick={() => onViewChange(v.value)}
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                padding: "5px 14px",
                borderRadius: 17,
                cursor: "pointer",
                transition: "all 150ms ease-in-out",
                background: active ? "white" : "transparent",
                color: active ? CHARCOAL : MUTED_LT,
                boxShadow: active ? "0 1px 3px rgba(44,44,44,0.12)" : "none",
                border: "none",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setPopoverOpen((o) => !o)}
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 11,
            color: GOLD,
            textDecoration: "underline",
            cursor: "pointer",
            background: "transparent",
            border: "none",
          }}
        >
          Customise →
        </button>

        {popoverOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-2"
            style={{
              width: 200,
              background: "white",
              border: "0.5px solid rgba(44,44,44,0.15)",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: CHARCOAL,
                marginBottom: 10,
              }}
            >
              Default view
            </p>
            {PREFS.map((row, idx) => {
              const selected = currentView === row.value;
              return (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => selectView(row.value)}
                  className="flex w-full items-start gap-2 text-left"
                  style={{
                    padding: "6px 0",
                    cursor: "pointer",
                    background: "transparent",
                    border: "none",
                    borderBottom: idx < PREFS.length - 1 ? "0.5px solid rgba(44,44,44,0.08)" : "none",
                  }}
                >
                  <span
                    className="mt-0.5 flex shrink-0 items-center justify-center"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: `0.5px solid ${selected ? SAGE : "rgba(44,44,44,0.25)"}`,
                    }}
                  >
                    {selected ? (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: SAGE }} />
                    ) : null}
                  </span>
                  <span>
                    <span style={{ display: "block", fontFamily: "Jost, sans-serif", fontSize: 12, color: CHARCOAL }}>
                      {row.title}
                    </span>
                    <span style={{ display: "block", fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED_LT, marginTop: 2 }}>
                      {row.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
