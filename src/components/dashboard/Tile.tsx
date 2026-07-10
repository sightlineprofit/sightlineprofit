import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export function Tile({
  eyebrow,
  title,
  onOpen,
  children,
  accent,
}: {
  eyebrow: string;
  title: string;
  onOpen?: () => void;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex h-full flex-col rounded-2xl border border-border bg-white p-6 text-left transition-all hover:border-gold/40 hover:shadow-[0_8px_30px_-12px_rgba(184,134,11,0.18)] focus:outline-none focus:ring-2 focus:ring-gold/30 ${accent ? "bg-gradient-to-br from-white to-goldp/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{eyebrow}</p>
          <h3 className="mt-1 font-display text-xl tracking-tight text-ch">{title}</h3>
        </div>
        <ArrowUpRight className="h-4 w-4 text-ch/30 transition-all group-hover:text-gold group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <div className="flex-1">{children}</div>
    </button>
  );
}