// Garmin Connect service — browser-based SSO login + edge function for API calls

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const GARMIN_API = `${SUPABASE_URL}/functions/v1/garmin-sync`;

const GARMIN_SSO_SIGNIN = "https://sso.garmin.com/sso/signin";
// Static callback page — extracts ticket and posts to opener via postMessage
const GARMIN_SERVICE_URL = `${window.location.origin}${import.meta.env.BASE_URL}garmin-callback.html`;

async function garminFetch(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${GARMIN_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Garmin API error: ${res.status}`);
  }
  return res.json();
}

export async function getGarminStatus(): Promise<{
  connected: boolean;
  expires_at: number | null;
  expired: boolean;
}> {
  return garminFetch("status");
}

/**
 * Opens Garmin SSO embed in a popup.
 * After login, embed page posts message with { serviceTicket } to window.opener.
 * We listen for that message to extract the ticket.
 */
export function openGarminLogin(): Promise<{ success: boolean; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      clientId: "GarminConnect",
      locale: "en",
      service: GARMIN_SERVICE_URL,
      gauthHost: "https://sso.garmin.com/sso",
    });

    const loginUrl = `${GARMIN_SSO_SIGNIN}?${params}`;
    const width = 450;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      loginUrl,
      "garmin_login",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    );

    if (!popup) {
      reject(new Error("Popup blocked. Bitte Popups erlauben."));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(interval);
      clearTimeout(timeout);
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    // Listen for postMessage from garmin-callback.html (same-origin)
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const ticket = event.data?.garminTicket;
      if (!ticket) return;
      popup.close();
      settle(() => {
        garminFetch("exchange-ticket", {
          ticket,
          service_url: GARMIN_SERVICE_URL,
        }).then(resolve).catch(reject);
      });
    };
    window.addEventListener("message", onMessage);

    // Fallback: poll for popup close or same-origin URL with ticket
    const interval = setInterval(() => {
      if (settled) return;
      try {
        if (popup.closed) {
          // Give message event a moment to fire before rejecting
          setTimeout(() => settle(() => reject(new Error("Login abgebrochen"))), 300);
          return;
        }
        // Backup: read URL directly if popup landed on our callback page
        const url = popup.location.href;
        if (url.includes("ticket=")) {
          const match = url.match(/[?&]ticket=([^&]+)/);
          if (match) {
            popup.close();
            settle(() => {
              garminFetch("exchange-ticket", {
                ticket: match[1],
                service_url: GARMIN_SERVICE_URL,
              }).then(resolve).catch(reject);
            });
          }
        }
      } catch {
        // Cross-origin — popup still on garmin.com
      }
    }, 500);

    const timeout = setTimeout(() => {
      if (!popup.closed) popup.close();
      settle(() => reject(new Error("Login Timeout (5 Minuten)")));
    }, 5 * 60 * 1000);
  });
}

export async function syncGarminHealth(date?: string): Promise<Record<string, unknown>> {
  return garminFetch("sync", date ? { date } : {});
}

export async function bulkSyncGarmin(days = 7): Promise<{ synced: number; results: unknown[] }> {
  return garminFetch("bulk-sync", { days });
}

// Typed health data matching edge function output
export interface GarminDailyStats {
  steps: number | null;
  distance_m: number | null;
  calories_total: number | null;
  calories_active: number | null;
  calories_bmr: number | null;
  floors_climbed: number | null;
  resting_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  avg_stress: number | null;
  max_stress: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  moderate_intensity_min: number | null;
  vigorous_intensity_min: number | null;
}

export interface GarminSleepData {
  start: number | null;
  end: number | null;
  duration_sec: number | null;
  deep_sec: number | null;
  light_sec: number | null;
  rem_sec: number | null;
  awake_sec: number | null;
  score: number | null;
  score_quality: string | null;
  avg_spo2: number | null;
  avg_respiration: number | null;
}

export interface GarminHRV {
  weekly_avg: number | null;
  last_night: number | null;
  last_night_5min_high: number | null;
  baseline_low: number | null;
  baseline_balanced_low: number | null;
  baseline_balanced_upper: number | null;
  status: string | null;
}

export interface GarminVO2Max {
  generic: number | null;
  running: number | null;
  cycling: number | null;
  fitness_age: number | null;
}

export interface GarminStress {
  avg: number | null;
  rest_stress_duration_sec: number | null;
  low_stress_duration_sec: number | null;
  medium_stress_duration_sec: number | null;
  high_stress_duration_sec: number | null;
}

export interface GarminHealthData {
  date: string;
  daily?: GarminDailyStats;
  sleep?: GarminSleepData;
  heart_rate?: { resting: number | null; min: number | null; max: number | null };
  hrv?: GarminHRV;
  stress?: GarminStress;
  vo2max?: GarminVO2Max;
}

export interface GarminHealthEntry {
  date: string;
  data: GarminHealthData;
}

export async function getGarminData(startDate: string, endDate: string): Promise<GarminHealthEntry[]> {
  return garminFetch("data", { start_date: startDate, end_date: endDate });
}
