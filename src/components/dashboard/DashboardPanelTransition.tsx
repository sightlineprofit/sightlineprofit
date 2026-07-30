import type { ReactNode } from "react";

export function DashboardPanelTransition({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  return (
    <div
      key={viewKey}
      style={{
        animation: "dashboardPanelFade 150ms ease-in-out",
      }}
    >
      <style>{`
        @keyframes dashboardPanelFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {children}
    </div>
  );
}
