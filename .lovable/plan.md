## Problem

On the Knowledge Base page, clicking an article shows only the title/summary because the article `body` (and video fields the reader also relies on) is never fetched.

`listKbItemsForUser` in `src/lib/admin.functions.ts` selects only a summary set of columns:

```
id, type, title, slug, category, summary, video_url, video_file_path,
thumbnail_path, tags, tier_visibility, featured, published_at
```

`body` is intentionally omitted (fine for a list). But `KbReader` in `src/routes/_authenticated/knowledge-base.tsx` renders directly from that same list row:

```
<ReactMarkdown>{typeof item.body === "string" ? item.body : ""}</ReactMarkdown>
```

So `item.body` is `undefined` → markdown renders empty. Only the header (title/summary) shows.

## Fix

Load the full item when the reader opens, instead of reusing the list row. `getKbItemBySlug` already exists and returns `select("*")`.

Change in `src/routes/_authenticated/knowledge-base.tsx` only:

1. Wire `getKbItemBySlug` via `useServerFn`.
2. When a card is clicked, keep `active` as the list row (for instant header render), and additionally `useQuery(["kb-item", active.slug], () => getFn({ data: { slug: active.slug } }))` inside `KbReader`.
3. In `KbReader`, merge: prefer the fetched full row for `body` / `video_url` / etc., fall back to the list row while loading. Show a subtle loading state for the body area.

No backend, schema, or other component changes. List query stays lean; detail query fetches the heavy `body` on demand.

## Acceptance

- Clicking any KB article shows the full markdown body (or the video embed) below the title/summary.
- List view performance unchanged (still no `body` in list payload).
- No other pages affected.
