import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Filter = { table: string; filter?: string; event?: "*" | "INSERT" | "UPDATE" | "DELETE" };

/**
 * Subscribes to Supabase realtime changes and invalidates the given React Query keys
 * when an event fires. Pass a stable channelName per consumer.
 */
export function useRealtimeInvalidate(
  channelName: string,
  subscriptions: Filter[],
  invalidateKeys: ReadonlyArray<ReadonlyArray<unknown>>,
  enabled = true,
) {
  const queryClient = useQueryClient();
  // Serialize deps so callers can pass inline arrays without retriggering.
  const subsKey = JSON.stringify(subscriptions);
  const keysKey = JSON.stringify(invalidateKeys);

  useEffect(() => {
    if (!enabled) return;
    const subs: Filter[] = JSON.parse(subsKey);
    const keys: ReadonlyArray<ReadonlyArray<unknown>> = JSON.parse(keysKey);
    const channel = supabase.channel(channelName);
    for (const s of subs) {
      channel.on(
        // @ts-expect-error - supabase types are loose here
        "postgres_changes",
        { event: s.event ?? "*", schema: "public", table: s.table, filter: s.filter },
        () => {
          for (const k of keys) {
            queryClient.invalidateQueries({ queryKey: k as unknown[] });
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, subsKey, keysKey, enabled, queryClient]);
}