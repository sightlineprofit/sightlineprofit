import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/growth-roadmap")({
  head: () => ({ meta: [{ title: "Growth Roadmap — Sightline" }] }),
  component: () => (
    <ModulePage
      eyebrow="Roadmap"
      title="Growth Roadmap"
      description="The path from one designer with a rate to a studio that knows its margins."
    >
      <ComingSoon />
    </ModulePage>
  ),
});