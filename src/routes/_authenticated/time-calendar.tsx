import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, ComingSoon } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/time-calendar")({
  head: () => ({ meta: [{ title: "Time Calendar — Sightline" }] }),
  component: () => (
    <ModulePage
      eyebrow="Studio"
      title="Time Calendar"
      description="Log hours by project, phase, and activity. Watch your weekly billable target in real time."
    >
      <ComingSoon />
    </ModulePage>
  ),
});