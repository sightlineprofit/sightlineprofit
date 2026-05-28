import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeFull } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — Sightline" }] }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <h1 className="font-display text-4xl tracking-tight text-ch mb-8">Knowledge Base</h1>
      <KnowledgeFull />
    </div>
  );
}