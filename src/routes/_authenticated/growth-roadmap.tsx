import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/growth-roadmap")({
  head: () => ({ meta: [{ title: "Future — Sightline" }] }),
  component: GrowthRoadmapRedirect,
});

function GrowthRoadmapRedirect() {
  return <Navigate to="/future" search={{ tab: "roadmap" }} replace />;
}
