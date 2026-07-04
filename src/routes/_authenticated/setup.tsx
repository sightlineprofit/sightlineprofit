import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/setup")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { panel: "rate" } });
  },
});
