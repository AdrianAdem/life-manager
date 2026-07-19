import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoClient, IS_DEMO } from "./demo-client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables");
}

// Demo mode swaps in an in-memory client so the app runs with no backend at all
// (`npm run demo`). The stub covers the query surface this app uses; the cast
// keeps every call site unchanged.
export const supabase: SupabaseClient = IS_DEMO
  ? (demoClient as unknown as SupabaseClient)
  : createClient(supabaseUrl, supabaseAnonKey);
