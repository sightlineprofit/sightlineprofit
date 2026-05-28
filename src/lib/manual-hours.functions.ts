import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const periodEnum = z.enum(["week", "month"]);
const spanEnum = z.enum(["day", "week", "month", "quarter", "year"]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0 Sun .. 6 Sat
  const diff = (dow + 6) % 7; // back to Monday
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Window [start, endExclusive) for the current period implied by a span. */
function spanWindow(span: z.infer<typeof spanEnum>): { start: Date; end: Date } {
  const now = new Date();
  if (span === "day" || span === "week") {
    const start = startOfWeekMonday(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (span === "month") {
    const start = startOfMonth(now);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  }
  if (span === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 1);
    return { start, end };
  }
  // year
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

export const listManualHourLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ period_type: periodEnum, limit: z.number().int().min(1).max(60).default(24) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("manual_hour_logs")
      .select("*")
      .eq("period_type", data.period_type)
      .order("period_start", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertManualHourLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        period_type: periodEnum,
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        total_hrs_worked: z.number().min(0).max(10000),
        billable_hrs: z.number().min(0).max(10000),
        notes: z.string().max(2000).optional().nullable(),
      })
      .refine((v) => v.billable_hrs <= v.total_hrs_worked, {
        message: "Billable hours cannot exceed total hours worked",
        path: ["billable_hrs"],
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const non_billable_hrs = Math.max(0, data.total_hrs_worked - data.billable_hrs);
    const { data: row, error } = await supabase
      .from("manual_hour_logs")
      .upsert(
        {
          firm_id: profile.firm_id,
          user_id: userId,
          period_type: data.period_type,
          period_start: data.period_start,
          total_hrs_worked: data.total_hrs_worked,
          billable_hrs: data.billable_hrs,
          non_billable_hrs,
          notes: data.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "firm_id,user_id,period_type,period_start" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteManualHourLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("manual_hour_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Combined actuals for the current period implied by `span`:
 * sums billable + total hours from manual_hour_logs (whose period_start falls
 * inside the window) and from time_entries (whose date falls inside the window).
 */
export const getActualsForSpan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ span: spanEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { start, end } = spanWindow(data.span);
    const startIso = isoDate(start);
    const endIso = isoDate(end);

    const [{ data: logs }, { data: entries }] = await Promise.all([
      supabase
        .from("manual_hour_logs")
        .select("billable_hrs,total_hrs_worked,period_start,period_type")
        .gte("period_start", startIso)
        .lt("period_start", endIso),
      supabase
        .from("time_entries")
        .select("hrs,billable,date")
        .gte("date", startIso)
        .lt("date", endIso),
    ]);

    let manualBillable = 0;
    let manualTotal = 0;
    for (const l of logs ?? []) {
      manualBillable += Number(l.billable_hrs || 0);
      manualTotal += Number(l.total_hrs_worked || 0);
    }
    let entriesBillable = 0;
    let entriesTotal = 0;
    for (const e of entries ?? []) {
      const h = Number(e.hrs || 0);
      entriesTotal += h;
      if (e.billable) entriesBillable += h;
    }
    return {
      billableHrs: manualBillable + entriesBillable,
      totalHrs: manualTotal + entriesTotal,
      manualBillable,
      manualTotal,
      entriesBillable,
      entriesTotal,
    };
  });