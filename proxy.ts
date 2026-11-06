import type { NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/proxy";

export const config = {
  matcher: [
    // Ignore Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export async function proxy(request: NextRequest) {
  return updateSession(request);
}
