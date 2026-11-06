import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/types/supabase";

export const SUPERADMIN_REQUIRED_ERROR_MESSAGE =
  "Please sign in with a superadmin account.";

export const isSuperadminProfile = async (
  supabase: SupabaseClient<Database>,
  userId: string | null | undefined,
): Promise<boolean> => {
  if (!userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return data?.is_superadmin === true;
};
