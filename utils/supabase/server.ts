import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/src/types/supabase";
import { getSupabasePublicEnv } from "@/utils/supabase/env";

export const createClient = async (): Promise<SupabaseClient<Database>> => {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();

  return createServerClient<Database>(supabaseUrl, supabasePublicKey, {
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // Server components cannot always write cookies.
        }
      },
    },
  }) as SupabaseClient<Database>;
};
