import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { markWelcomed } from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Sightline" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const nav = useNavigate();
  const { data, isLoading } = useMe();
  const qc = useQueryClient();
  const mark = useServerFn(markWelcomed);
  const [going, setGoing] = useState(false);

  if (isLoading || !data?.profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-ch/50">Loading…</div>
      </div>
    );
  }

  const role = effectiveRole(data.profile);
  if (role !== "team") {
    if (role === "principal" || role === "admin") nav({ to: "/dashboard", replace: true });
    else if (role === "view_only") nav({ to: "/my-work", replace: true });
    return null;
  }
  if (data.profile.welcomed_at) {
    nav({ to: "/my-work", replace: true });
    return null;
  }

  async function go() {
    setGoing(true);
    try {
      await mark();
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav({ to: "/my-work", replace: true });
    } finally {
      setGoing(false);
    }
  }

  const firmName = data.firm?.name ?? "your firm";

  return (
    <div className="min-h-[80vh] bg-cream">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1
          className="text-[#2C2C2C]"
          style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 26, fontWeight: 400 }}
        >
          Welcome to Sightline
        </h1>
        <p
          className="mt-4 leading-[1.75] text-[#2C2C2C]"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 14, fontWeight: 400 }}
        >
          You&apos;ve been added to {firmName}&apos;s Sightline account. Here you can see the projects
          you&apos;re assigned to, log your time, and track your tasks. Financial details stay with
          the firm owner.
        </p>

        <div className="mt-8">
          <p className="mb-2 text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
            What you can do:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.75] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
            <li>See your assigned projects and tasks</li>
            <li>Log billable and non-billable time</li>
            <li>View upcoming milestones</li>
            <li>Access the knowledge base</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
            What&apos;s private to the firm owner:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.75] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
            <li>Project fees and margins</li>
            <li>Rate architecture</li>
            <li>Revenue targets</li>
            <li>Financial reports</li>
          </ul>
        </div>

        <div className="mt-10">
          <button
            type="button"
            onClick={go}
            disabled={going}
            className="inline-flex items-center gap-2 rounded-md bg-[#2C2C2C] px-6 py-3 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#2C2C2C]/90 disabled:opacity-60"
            style={{ fontFamily: "Jost, sans-serif" }}
          >
            {going ? "Loading…" : "Go to my work →"}
          </button>
        </div>
      </div>
    </div>
  );
}
