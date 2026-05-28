import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/rate-architecture")({
  head: () => ({ meta: [{ title: "Rate & Cost — Sightline" }] }),
  component: () => (
    <ModulePage
      eyebrow="Foundation"
      title="Rate & Cost Architecture"
      description="What does your rate need to be to actually pay yourself and the studio?"
    >
      <ComingSoon />
    </ModulePage>
  ),
});