type Role = "principal" | "admin" | "team" | "view_only";

const ROLE_DESCRIPTIONS: Record<Role, { heading: string; body: string }> = {
  team: {
    heading: "Team members cannot access this section.",
    body: "They see: Time Calendar, assigned Projects, Knowledge Base.",
  },
  view_only: {
    heading: "View-only users cannot access this section.",
    body: "They see: Projects (read-only), SOP Library (read-only), Knowledge Base.",
  },
  admin: {
    heading: "Admins cannot access this section.",
    body: "They see the full app minus billing — that's owner-only.",
  },
  principal: {
    heading: "Principals see this section.",
    body: "No restriction simulated here.",
  },
};

export function RestrictedPreview({ role }: { role: Role }) {
  const copy = ROLE_DESCRIPTIONS[role];
  return (
    <div className="mx-auto max-w-xl px-8 py-20">
      <div className="rounded-md bg-creamd p-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
          View-as preview
        </p>
        <h2 className="mt-3 font-display text-2xl tracking-tight text-ch">
          {copy.heading}
        </h2>
        <p className="mt-3 text-sm text-ch/70" style={{ fontFamily: "Jost, system-ui, sans-serif" }}>
          {copy.body}
        </p>
        <p className="mt-4 text-xs text-ch/50">
          You're not actually restricted — this is what the simulated role would see.
          Pick a different role from the View-as panel to continue testing.
        </p>
      </div>
    </div>
  );
}