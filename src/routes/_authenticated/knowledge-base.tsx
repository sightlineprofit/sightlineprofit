import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
  head: () => ({ meta: [{ title: "Knowledge Base — Sightline" }] }),
  component: () => (
    <ModulePage
      eyebrow="Help"
      title="Knowledge Base"
      description="Plain-language guides on how Sightline calculates rates, costs, and project margin."
    >
      <ComingSoon note="Articles are being written — your concierge can answer anything in the meantime." />
    </ModulePage>
  ),
});