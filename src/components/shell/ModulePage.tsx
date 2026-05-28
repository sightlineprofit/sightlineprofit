import type { ReactNode } from "react";

export function ModulePage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold">{eyebrow}</p>
          )}
          <h1 className="mt-2 font-display text-5xl tracking-tight text-ch">{title}</h1>
          {description && <p className="mt-2 max-w-xl text-ch/70">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="pt-8">{children}</div>
    </div>
  );
}

export function ComingSoon({ note }: { note?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white/60 p-12 text-center">
      <p className="font-display text-2xl italic text-ch/60">In progress</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ch/60">
        {note ?? "This module is being built. Your data and settings are already saved."}
      </p>
    </div>
  );
}