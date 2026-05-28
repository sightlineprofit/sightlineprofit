import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Sightline" }] }),
  component: () => (
    <div className="min-h-screen bg-cream px-6 py-16 text-ch">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl tracking-tight">Billing</h1>
        <p className="mt-3 text-ch/70">Subscription management will be enabled here. Your trial continues until then.</p>
        <Link to="/dashboard" className="mt-6 inline-block text-gold hover:text-goldl">← Back to dashboard</Link>
      </div>
    </div>
  ),
});