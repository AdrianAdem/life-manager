// Strava API service — all calls go through Edge Functions
import { supabase } from "./supabase";
import { USER_ID } from "./constants";
import { IS_DEMO } from "./demo-client";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export async function getStravaStatus() {
  // Demo mode has no edge functions; the fixture activities are already loaded,
  // so report a connected account rather than an error state.
  if (IS_DEMO) {
    return {
      connected: true,
      athlete_name: "Demo Athlete",
      athlete_id: 0,
      last_updated: new Date().toISOString(),
    };
  }
  const res = await fetch(`${FUNCTIONS_URL}/strava-auth/status?user_id=${USER_ID}`);
  return res.json() as Promise<{
    connected: boolean;
    athlete_name: string | null;
    athlete_id: number | null;
    last_updated: string | null;
  }>;
}

export async function getStravaAuthUrl() {
  const res = await fetch(`${FUNCTIONS_URL}/strava-auth/authorize?user_id=${USER_ID}`);
  const data = await res.json();
  return data.url as string;
}

export async function disconnectStrava() {
  const res = await fetch(`${FUNCTIONS_URL}/strava-auth/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  return res.json();
}

export async function syncStravaActivities(page = 1, perPage = 30) {
  if (IS_DEMO) return { imported: 0, skipped: 5, total_fetched: 5, has_more: false };
  const res = await fetch(`${FUNCTIONS_URL}/strava-sync/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, page, per_page: perPage }),
  });
  return res.json() as Promise<{
    imported: number;
    skipped: number;
    total_fetched: number;
    has_more: boolean;
  }>;
}

export async function getCardioActivities(limit = 50) {
  const { data } = await supabase
    .from("cardio_activities")
    .select("*")
    .eq("user_id", USER_ID)
    .order("start_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getActivityDetail(activityId: string) {
  const res = await fetch(`${FUNCTIONS_URL}/strava-sync/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, activity_id: activityId }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getActivityStreams(activityId: string, keys?: string) {
  const res = await fetch(`${FUNCTIONS_URL}/strava-sync/streams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, activity_id: activityId, keys }),
  });
  return res.json() as Promise<Record<string, unknown[]>>;
}

export async function saveManualActivity(activity: {
  activity_type: string;
  name: string;
  start_date: string;
  elapsed_time_sec: number;
  moving_time_sec: number;
  distance_m: number;
  elevation_gain_m: number;
  avg_pace_sec_per_km: number | null;
  avg_speed_ms: number | null;
  calories: number | null;
  raw_data: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("cardio_activities")
    .insert({
      user_id: USER_ID,
      source: "manual",
      external_id: null,
      ...activity,
      avg_heartrate: null,
      max_heartrate: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCardioActivitiesForDateRange(startDate: string, endDate: string) {
  const { data } = await supabase
    .from("cardio_activities")
    .select("*")
    .eq("user_id", USER_ID)
    .gte("start_date", startDate)
    .lte("start_date", endDate)
    .order("start_date", { ascending: false });
  return data ?? [];
}
