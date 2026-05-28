import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  beforeLoad: () => { throw redirect({ to: "/sightline" }); },
});