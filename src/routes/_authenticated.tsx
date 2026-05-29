import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/shell/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // The browser Supabase client persists its session in localStorage, which
    // SSR cannot read. If we check on the server, getUser() returns null and
    // we'd redirect a logged-in user back to /login. The client re-runs
    // beforeLoad after hydration, and every server fn is independently gated
    // by requireSupabaseAuth, so skipping this check on the server is safe.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}