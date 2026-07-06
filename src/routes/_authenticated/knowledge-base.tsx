import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listKbItemsForUser, getKbItemBySlug } from "@/lib/admin.functions";
import { getMyContext } from "@/lib/firm.functions";
import { ModulePage } from "@/components/shell/ModulePage";
import { effectiveTier } from "@/lib/role";
import { cn } from "@/lib/utils";
import { Play, FileText, Search, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
  head: () => ({ meta: [{ title: "Knowledge Base — Sightline" }] }),
  component: KbPage,
});

function KbPage() {
  const listFn = useServerFn(listKbItemsForUser);
  const ctxFn = useServerFn(getMyContext);
  const { data: items = [] } = useQuery({ queryKey: ["kb-items"], queryFn: () => listFn() });
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => ctxFn() });
  const tier = effectiveTier(ctx?.profile, ctx?.firm);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [active, setActive] = useState<any | null>(null);

  const visible = useMemo(
    () => items.filter((i: any) => (i.tier_visibility ?? []).includes(tier)),
    [items, tier],
  );
  const categories = useMemo(
    () => Array.from(new Set(visible.map((i: any) => i.category))),
    [visible],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((i: any) => {
      if (cat && i.category !== cat) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.summary ?? "").toLowerCase().includes(q) ||
        (i.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
      );
    });
  }, [visible, query, cat]);

  if (active) return <KbReader item={active} onBack={() => setActive(null)} />;

  return (
    <ModulePage
      eyebrow="Help"
      title="Knowledge Base"
      description="Plain-language guides on how Sightline calculates rates, costs, and project margin."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ch/40" />
          <input
            type="text"
            placeholder="Search articles and videos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-white pl-10 pr-3 py-2 text-sm focus:border-gold focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCat(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              !cat ? "bg-gold text-white" : "bg-white border border-border text-ch/60 hover:text-ch",
            )}
          >All</button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                cat === c ? "bg-gold text-white" : "bg-white border border-border text-ch/60 hover:text-ch",
              )}
            >{c}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white/60 p-12 text-center">
          <p className="font-display text-2xl italic text-ch/60">Nothing found</p>
          <p className="mt-2 text-sm text-ch/60">
            {visible.length === 0
              ? "Articles for your tier are being written — your concierge can answer anything in the meantime."
              : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i: any) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setActive(i)}
              className="group flex flex-col rounded-lg border border-border bg-white p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-gold">
                {i.type === "video" ? <Play className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span>{i.category}</span>
                {i.featured && <span className="ml-auto">★ Featured</span>}
              </div>
              <h3 className="font-display text-xl leading-snug text-ch group-hover:text-gold">{i.title}</h3>
              {i.summary && <p className="mt-2 line-clamp-3 text-sm text-ch/60">{i.summary}</p>}
              {i.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {i.tags.slice(0, 3).map((t: string) => (
                    <span key={t} className="rounded bg-creamd px-2 py-0.5 text-[10px] text-ch/60">{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </ModulePage>
  );
}

function KbReader({ item, onBack }: { item: any; onBack: () => void }) {
  const getFn = useServerFn(getKbItemBySlug);
  const { data: full, isLoading } = useQuery({
    queryKey: ["kb-item", item.slug],
    queryFn: () => getFn({ data: { slug: item.slug } }),
    enabled: !!item.slug,
  });
  const merged: any = { ...item, ...(full ?? {}) };
  const isYouTube = merged.video_url && /youtube\.com|youtu\.be/.test(merged.video_url);
  const isVimeo = merged.video_url && /vimeo\.com/.test(merged.video_url);
  const embedUrl = (() => {
    if (!merged.video_url) return null;
    if (isYouTube) {
      const m = merged.video_url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
      return m ? `https://www.youtube.com/embed/${m[1]}` : null;
    }
    if (isVimeo) {
      const m = merged.video_url.match(/vimeo\.com\/(\d+)/);
      return m ? `https://player.vimeo.com/video/${m[1]}` : null;
    }
    return null;
  })();

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1 text-sm text-ch/60 hover:text-ch"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </button>
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold">{merged.category}</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight text-ch">{merged.title}</h1>
      {merged.summary && <p className="mt-3 text-lg text-ch/70">{merged.summary}</p>}

      <div className="mt-8">
        {merged.type === "video" && merged.video_url ? (
          embedUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe src={embedUrl} className="h-full w-full" allowFullScreen title={merged.title} />
            </div>
          ) : (
            <video src={merged.video_url} controls className="w-full rounded-lg" />
          )
        ) : isLoading && !merged.body ? (
          <p className="text-sm text-ch/50">Loading article…</p>
        ) : (
          <article className="prose prose-stone max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-gold">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {typeof merged.body === "string" ? merged.body : ""}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}