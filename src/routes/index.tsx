import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sightline — Financial clarity for interior design firms" },
      { name: "description", content: "Know your rate. Hit your targets. See what each project really earned." },
      { property: "og:title", content: "Sightline" },
      { property: "og:description", content: "Financial clarity for interior design firms." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-cream text-ch">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-display text-2xl tracking-tight">Sightline</div>
        <nav className="flex items-center gap-6 text-sm">
          <Link to="/login" className="text-ch/70 hover:text-ch">Sign in</Link>
          <Link
            to="/register"
            className="rounded bg-ch px-4 py-2 text-cream hover:bg-ch/90"
          >
            Start free trial
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="mb-6 text-xs uppercase tracking-[0.25em] text-gold">For interior design firm owners</p>
        <h1 className="font-display text-6xl leading-[1.05] tracking-tight md:text-7xl">
          The number beneath the number.
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-base text-ch/70">
          Sightline answers the three questions every firm owner needs at different stages of her practice —
          what does my rate need to be, am I hitting my targets, and was this project profitable?
        </p>
        <div className="mt-12 flex items-center justify-center gap-4">
          <Link
            to="/register"
            className="rounded bg-gold px-6 py-3 text-sm font-medium text-white hover:bg-goldl"
          >
            Begin your 14-day trial
          </Link>
          <Link to="/login" className="text-sm text-ch/70 hover:text-ch">
            I already have an account →
          </Link>
        </div>
      </main>
    </div>
  );
}
