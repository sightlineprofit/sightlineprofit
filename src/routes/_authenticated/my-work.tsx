import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { useMe, effectiveRole } from "@/lib/role";
import { MyWorkPageContent } from "@/components/my-work/MyWorkPageContent";

export const Route = createFileRoute("/_authenticated/my-work")({
  validateSearch: (s: Record<string, unknown>): { preview_member?: string } => ({
    preview_member: typeof s.preview_member === "string" ? s.preview_member : undefined,
  }),
  head: () => ({ meta: [{ title: "My Work — Sightline" }] }),
  component: MyWorkRoute,
});

function MyWorkRoute() {
  const { data, isLoading } = useMe();
  const { preview_member: previewMemberId } = useSearch({ from: "/_authenticated/my-work" });
  const role = effectiveRole(data?.profile);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-[#8A7F75]">Loading…</div>;
  }

  if (previewMemberId) {
    if (role !== "principal" && role !== "admin" && !data?.profile?.is_super_admin) {
      return <Navigate to="/dashboard" replace />;
    }
    return <MyWorkPageContent previewMemberId={previewMemberId} />;
  }

  if (role === "principal" || role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  if (role !== "team" && role !== "view_only") {
    return <Navigate to="/dashboard" replace />;
  }

  return <MyWorkPageContent />;
}
