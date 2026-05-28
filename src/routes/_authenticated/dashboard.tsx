import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyContext } from "@/lib/firm.functions";
import { ModulePage } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sightline" }] }),
  component: Dashboard,
});

function Dashboard() {
  const getCtx = useServerFn(getMyContext);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });

  return (
    <ModulePage eyebrow="Foundation" title={data?.firm?.name ?? "Dashboard"}>
      <p className="mt-3 max-w-xl text-ch/70">
        Your firm-level dashboard is being built. Onboarding has been saved — you can revisit any step from settings.
      </p>
    </ModulePage>
  );
}