import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream text-ch">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-2xl tracking-tight">
          Sightline
        </Link>
      </header>
      <main className="mx-auto max-w-md px-6 py-10">
        <div className="rounded-lg border border-border bg-white p-8 shadow-[0_1px_2px_rgba(44,44,44,0.04)]">
          <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-ch/70">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-ch/60">{footer}</div> : null}
      </main>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ch/60">
      {children}
    </label>
  );
}

export const inputClass =
  "block w-full rounded border border-input bg-white px-3 py-2.5 text-sm text-ch outline-none transition focus:border-gold focus:ring-2 focus:ring-goldp";

export const primaryBtnClass =
  "inline-flex w-full items-center justify-center rounded bg-ch px-4 py-2.5 text-sm font-medium text-cream transition hover:bg-ch/90 disabled:cursor-not-allowed disabled:opacity-60";

export const ghostBtnClass =
  "inline-flex w-full items-center justify-center gap-2 rounded border border-border bg-white px-4 py-2.5 text-sm font-medium text-ch transition hover:bg-creamd";