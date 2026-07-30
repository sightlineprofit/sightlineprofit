const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not configured`);
  return v;
}

export function googleCalendarRedirectUri(): string {
  const base = process.env.PUBLIC_APP_URL || "http://localhost:8080";
  return `${base.replace(/\/$/, "")}/api/calendar/google/callback`;
}

export function buildGoogleCalendarAuthUrl(state: string): string {
  const clientId = requireEnv("GOOGLE_CALENDAR_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeGoogleCalendarCode(code: string): Promise<GoogleTokenResponse> {
  const clientId = requireEnv("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleCalendarRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(json.error_description || json.error || "Google token exchange failed");
  }
  return json;
}

export async function refreshGoogleCalendarToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = requireEnv("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(json.error_description || json.error || "Google token refresh failed");
  }
  return json;
}

export async function fetchGoogleCalendarEvents(args: {
  accessToken: string;
  calendarId?: string;
  timeMin: string;
  timeMax: string;
}): Promise<GoogleCalendarEvent[]> {
  const calendarId = encodeURIComponent(args.calendarId || "primary");
  const params = new URLSearchParams({
    timeMin: args.timeMin,
    timeMax: args.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
    { headers: { Authorization: `Bearer ${args.accessToken}` } },
  );
  const json = (await res.json()) as { items?: GoogleCalendarEvent[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message || "Failed to fetch Google Calendar events");
  }
  return json.items ?? [];
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

/** Map API event → DB row fields (ISO timestamps; display conversion happens client-side). */
export function normalizeGoogleEvent(ev: GoogleCalendarEvent): {
  external_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
} | null {
  if (!ev.id) return null;
  const allDay = !!ev.start?.date && !ev.start?.dateTime;

  if (allDay && ev.start?.date) {
    const endDate = ev.end?.date || ev.start.date;
    return {
      external_id: ev.id,
      title: (ev.summary || "Untitled").trim(),
      description: ev.description?.trim() || null,
      location: ev.location?.trim() || null,
      start_at: `${ev.start.date}T00:00:00.000Z`,
      end_at: `${endDate}T00:00:00.000Z`,
      all_day: true,
    };
  }

  if (!ev.start?.dateTime || !ev.end?.dateTime) return null;

  const startAt = new Date(ev.start.dateTime);
  const endAt = new Date(ev.end.dateTime);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return null;
  }

  return {
    external_id: ev.id,
    title: (ev.summary || "Untitled").trim(),
    description: ev.description?.trim() || null,
    location: ev.location?.trim() || null,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    all_day: false,
  };
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
}
