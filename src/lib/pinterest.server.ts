import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PinterestBoard = {
  id: string;
  name: string;
  description: string | null;
  pinCount: number;
  coverUrl: string | null;
  isSelected: boolean;
};

export type PinterestPin = {
  id: string;
  boardId: string;
  imageUrl: string;
  alt: string | null;
  pinUrl: string;
};

function pinterestEnv() {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  const redirectUri =
    process.env.PINTEREST_REDIRECT_URI ||
    `${(process.env.PUBLIC_APP_URL || "http://localhost:8080").replace(/\/$/, "")}/auth/pinterest/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getPinterestOAuthUrl(firmId: string, userId: string): string {
  const { clientId, redirectUri } = pinterestEnv();
  if (!clientId) {
    throw new Error("Pinterest is not configured (missing PINTEREST_CLIENT_ID).");
  }
  const state = Buffer.from(JSON.stringify({ firmId, userId }), "utf8").toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "boards:read,pins:read",
    state,
  });
  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

export async function completePinterestOAuth(code: string, state: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = pinterestEnv();
  if (!clientId || !clientSecret) {
    throw new Error("Pinterest OAuth is not configured.");
  }

  let firmId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      firmId?: string;
    };
    if (!parsed.firmId) throw new Error("invalid_state");
    firmId = parsed.firmId;
  } catch {
    throw new Error("invalid_state");
  }

  const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Pinterest token exchange failed: ${text.slice(0, 200)}`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!tokenJson.access_token) throw new Error("missing_access_token");

  const { data: existing } = await supabaseAdmin
    .from("firm_vision")
    .select("id")
    .eq("firm_id", firmId)
    .maybeSingle();

  const row = {
    pinterest_access_token: tokenJson.access_token,
    pinterest_refresh_token: tokenJson.refresh_token ?? null,
    pinterest_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin.from("firm_vision").update(row).eq("firm_id", firmId);
  } else {
    await supabaseAdmin.from("firm_vision").insert({ firm_id: firmId, ...row });
  }
}

async function readVisionTokens(firmId: string) {
  const { data } = await supabaseAdmin
    .from("firm_vision")
    .select(
      "pinterest_access_token, pinterest_refresh_token, selected_board_ids, pinterest_connected_at",
    )
    .eq("firm_id", firmId)
    .maybeSingle();
  return data as {
    pinterest_access_token?: string | null;
    pinterest_refresh_token?: string | null;
    selected_board_ids?: string[] | null;
  } | null;
}

async function refreshAccessToken(
  firmId: string,
  refreshToken: string,
): Promise<string | null> {
  const { clientId, clientSecret } = pinterestEnv();
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!json.access_token) return null;

  await supabaseAdmin
    .from("firm_vision")
    .update({
      pinterest_access_token: json.access_token,
      pinterest_refresh_token: json.refresh_token ?? refreshToken,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", firmId);

  return json.access_token;
}

async function pinterestFetch(
  firmId: string,
  path: string,
  retried = false,
): Promise<Response> {
  const vision = await readVisionTokens(firmId);
  let token = vision?.pinterest_access_token;
  if (!token) throw new Error("not_connected");

  let res = await fetch(`https://api.pinterest.com/v5${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && !retried && vision?.pinterest_refresh_token) {
    const next = await refreshAccessToken(firmId, vision.pinterest_refresh_token);
    if (next) {
      token = next;
      res = await fetch(`https://api.pinterest.com/v5${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
  return res;
}

export async function fetchPinterestBoards(firmId: string): Promise<PinterestBoard[]> {
  const vision = await readVisionTokens(firmId);
  if (!vision?.pinterest_access_token) return [];

  const res = await pinterestFetch(firmId, "/boards?page_size=50");
  if (!res.ok) return [];

  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      name?: string;
      description?: string;
      pin_count?: number;
      media?: { image_cover_url?: string };
    }>;
  };

  const selected = new Set(vision.selected_board_ids ?? []);
  return (json.items ?? []).map((b) => ({
    id: b.id ?? "",
    name: b.name ?? "Board",
    description: b.description ?? null,
    pinCount: b.pin_count ?? 0,
    coverUrl: b.media?.image_cover_url ?? null,
    isSelected: selected.has(b.id ?? ""),
  }));
}

export async function fetchPinterestPins(
  firmId: string,
  boardIds: string[],
  limit = 24,
): Promise<PinterestPin[]> {
  if (!boardIds.length) return [];
  const vision = await readVisionTokens(firmId);
  if (!vision?.pinterest_access_token) return [];

  const pins: PinterestPin[] = [];
  for (const boardId of boardIds) {
    const res = await pinterestFetch(
      firmId,
      `/boards/${encodeURIComponent(boardId)}/pins?page_size=25`,
    );
    if (!res.ok) continue;
    const json = (await res.json()) as {
      items?: Array<{
        id?: string;
        title?: string;
        link?: string;
        media?: { images?: { ["1200x"]?: { url?: string }; original?: { url?: string } } };
      }>;
    };
    for (const pin of json.items ?? []) {
      const imageUrl =
        pin.media?.images?.["1200x"]?.url ??
        pin.media?.images?.original?.url ??
        "";
      if (!imageUrl) continue;
      pins.push({
        id: pin.id ?? `${boardId}-${pins.length}`,
        boardId,
        imageUrl,
        alt: pin.title ?? null,
        pinUrl: pin.link ?? `https://www.pinterest.com/pin/${pin.id}/`,
      });
    }
  }

  for (let i = pins.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pins[i], pins[j]] = [pins[j]!, pins[i]!];
  }
  return pins.slice(0, limit);
}
