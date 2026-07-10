import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/shell/AppShell";
import { TourProvider } from "@/components/tour/TourProvider";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <TourProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </TourProvider>
  );
}