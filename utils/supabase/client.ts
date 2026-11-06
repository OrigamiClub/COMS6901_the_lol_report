import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/types/supabase";
import { getSupabasePublicEnv } from "@/utils/supabase/env";

let browserClient: SupabaseClient<Database> | null = null;

export const createClient = (): SupabaseClient<Database> => {
  if (typeof window === "undefined") {
    throw new Error("utils/supabase/client.ts can only be used in the browser.");
  }

  const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabasePublicKey, { cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl) });
  }

  return browserClient;
};
