import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/sop-library/$id")({
  beforeLoad: () => { throw redirect({ to: "/sop-library" }); },
});