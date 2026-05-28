import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/sightline")({
  head: () => ({ meta: [{ title: "Sightline — Project Profitability" }] }),
  component: () => (
    <ModulePage
      eyebrow="Practice"
      title="Sightline"
      description="Was this project actually profitable? Compare scoped hours against the truth."
    >
      <ComingSoon />
    </ModulePage>
  ),
});