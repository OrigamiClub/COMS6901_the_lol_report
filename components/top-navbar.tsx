import { TopNavbarClient } from "@/components/top-navbar-client";
import { createClient } from "@/utils/supabase/server";

export async function TopNavbar() {
  let user = null;
  try {
    const supabase = await createClient();
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("TopNavbar: Failed to fetch user session from Supabase", error);
  }

  const siteTitle = process.env.NEXT_PUBLIC_SITE_TITLE?.trim() || "The LOL Report";

  return <TopNavbarClient user={user} siteTitle={siteTitle} />;
}
