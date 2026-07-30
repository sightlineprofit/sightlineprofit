import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildGoogleCalendarAuthUrl,
  fetchGoogleCalendarEvents,
  fetchGoogleAccountEmail,
  isGoogleCalendarConfigured,
  normalizeGoogleEvent,
  refreshGoogleCalendarToken,
} from "@/lib/google-calendar.server";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type OverlayEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
};

type CalendarConnectionRow = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string | null;
  firm_id: string;
};

function oauthStateToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureAccessToken(connection: CalendarConnectionRow): Promise<string> {
  const admin = await getAdmin();
  const expires = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expires > Date.now() + 60_000) return connection.access_token;

  if (!connection.refresh_token) {
    throw new Error("Google Calendar connection expired. Reconnect in Time Calendar.");
  }

  const refreshed = await refreshGoogleCalendarToken(connection.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin
    .from("calendar_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return refreshed.access_token;
}

async function syncGoogleEventsInRange(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<number> {
  const admin = await getAdmin();
  const { data: conn } = await admin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!conn) return 0;

  const accessToken = await ensureAccessToken(conn as CalendarConnectionRow);

  const items = await fetchGoogleCalendarEvents({
    accessToken,
    calendarId: conn.calendar_id || "primary",
    timeMin,
    timeMax,
  });

  const rows = items
    .map(normalizeGoogleEvent)
    .filter(Boolean)
    .map((ev) => ({
      user_id: userId,
      firm_id: conn.firm_id,
      connection_id: conn.id,
      external_id: ev!.external_id,
      title: ev!.title,
      description: ev!.description,
      location: ev!.location,
      start_at: ev!.start_at,
      end_at: ev!.end_at,
      all_day: ev!.all_day,
      synced_at: new Date().toISOString(),
    }));

  if (rows.length) {
    await admin.from("calendar_events").upsert(rows, { onConflict: "connection_id,external_id" });
  }

  await admin
    .from("calendar_connections")
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conn.id);

  return rows.length;
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pull Google events for one visible week into the local overlay cache. */
async function syncGoogleEventsForWeek(userId: string, weekStart: string): Promise<number> {
  const { startIso, endIso } = weekRangeUtc(weekStart);
  return syncGoogleEventsInRange(userId, startIso, endIso);
}

/** Wider pull used on connect / manual resync: 2 weeks back through 12 weeks ahead. */
async function syncGoogleEventsWide(userId: string, anchorWeekStart: string): Promise<number> {
  const startIso = `${addDaysIso(anchorWeekStart, -14)}T00:00:00.000Z`;
  const endIso = `${addDaysIso(anchorWeekStart, 7 * 12)}T00:00:00.000Z`;
  return syncGoogleEventsInRange(userId, startIso, endIso);
}

function mapOverlayRow(r: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
}): OverlayEvent {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    start_at: r.start_at,
    end_at: r.end_at,
    all_day: r.all_day,
  };
}

function weekRangeUtc(weekStart: string): { startIso: string; endIso: string } {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 8);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export const getCalendarIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const admin = await getAdmin();
    const { data: conn } = await admin
      .from("calendar_connections")
      .select("id, provider, account_email, last_synced_at, calendar_id")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    return {
      configured: isGoogleCalendarConfigured(),
      connected: !!conn,
      provider: conn?.provider ?? null,
      accountEmail: conn?.account_email ?? null,
      lastSyncedAt: conn?.last_synced_at ?? null,
    };
  });

export const beginGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    if (!isGoogleCalendarConfigured()) {
      throw new Error(
        "Google Calendar is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.",
      );
    }

    const admin = await getAdmin();
    const token = oauthStateToken();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await admin.from("calendar_oauth_states").insert({
      token,
      user_id: userId,
      provider: "google",
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    return { authUrl: buildGoogleCalendarAuthUrl(token) };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const admin = await getAdmin();
    const { data: conn } = await admin
      .from("calendar_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    if (conn?.id) {
      await admin.from("calendar_connections").delete().eq("id", conn.id);
    }
    return { ok: true };
  });

export const resyncCalendarOverlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekStart: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const count = await syncGoogleEventsWide(context.userId, data.weekStart);
    return { ok: true, count };
  });

export const getCalendarOverlay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekStart: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await getAdmin();

    const { data: conn } = await admin
      .from("calendar_connections")
      .select("id, last_synced_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    if (!conn) {
      return { connected: false, events: [] as OverlayEvent[] };
    }

    try {
      // First visit after connect: wide sync. Otherwise sync the visible week.
      if (!conn.last_synced_at) {
        await syncGoogleEventsWide(userId, data.weekStart);
      } else {
        await syncGoogleEventsForWeek(userId, data.weekStart);
      }
    } catch (e) {
      console.warn("[getCalendarOverlay] sync failed:", e);
    }

    const { startIso, endIso } = weekRangeUtc(data.weekStart);

    const { data: rows } = await admin
      .from("calendar_events")
      .select("id, title, description, location, start_at, end_at, all_day, linked_time_entry_id")
      .eq("user_id", userId)
      .is("linked_time_entry_id", null)
      .gte("start_at", startIso)
      .lt("start_at", endIso)
      .order("start_at", { ascending: true });

    const events = (rows ?? []).map((r) => mapOverlayRow(r as Parameters<typeof mapOverlayRow>[0]));
    return { connected: true, events };
  });

export const linkCalendarEventToEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ calendarEventId: z.string().uuid(), timeEntryId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await getAdmin();
    const { error } = await admin
      .from("calendar_events")
      .update({ linked_time_entry_id: data.timeEntryId })
      .eq("id", data.calendarEventId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Called from OAuth callback route — not a client server fn. */
export async function completeGoogleCalendarOAuth(code: string, state: string): Promise<string> {
  const admin = await getAdmin();
  const { data: pending } = await admin
    .from("calendar_oauth_states")
    .select("user_id, expires_at")
    .eq("token", state)
    .eq("provider", "google")
    .maybeSingle();

  if (!pending) throw new Error("Invalid or expired OAuth state");
  if (new Date(pending.expires_at as string) < new Date()) {
    await admin.from("calendar_oauth_states").delete().eq("token", state);
    throw new Error("OAuth state expired");
  }

  const { exchangeGoogleCalendarCode } = await import("@/lib/google-calendar.server");
  const tokens = await exchangeGoogleCalendarCode(code);
  const email = await fetchGoogleAccountEmail(tokens.access_token);

  const { data: profile } = await admin
    .from("profiles")
    .select("firm_id")
    .eq("id", pending.user_id)
    .single();
  if (!profile?.firm_id) throw new Error("No firm for user");

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin.from("calendar_connections").upsert(
    {
      user_id: pending.user_id,
      firm_id: profile.firm_id,
      provider: "google",
      account_email: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      calendar_id: "primary",
      last_synced_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  await admin.from("calendar_oauth_states").delete().eq("token", state);

  // Seed overlay cache: 2 weeks back through 12 weeks ahead from the current week.
  const day = new Date().getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() + monOffset);
  const weekStart = monday.toISOString().slice(0, 10);
  try {
    await syncGoogleEventsWide(pending.user_id as string, weekStart);
  } catch (e) {
    console.warn("[completeGoogleCalendarOAuth] initial wide sync failed:", e);
  }

  return pending.user_id as string;
}
