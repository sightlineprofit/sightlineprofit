import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/sop-library")({
  head: () => ({ meta: [{ title: "SOP Library — Sightline" }] }),
  component: () => (
    <ModulePage
      eyebrow="Practice"
      title="SOP Library"
      description="Scope templates and phase benchmarks that turn into the contracts you send."
    >
      <ComingSoon />
    </ModulePage>
  ),
});