import { createServerClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/src/types/supabase";
import { getSupabasePublicEnv } from "@/utils/supabase/env";
import {
  isSuperadminProfile,
  SUPERADMIN_REQUIRED_ERROR_MESSAGE,
} from "@/utils/supabase/superadmin";

const isPublicRoute = (pathname: string) =>
  pathname === "/login" || pathname.startsWith("/auth/callback");

const redirectToLogin = (request: NextRequest, error?: string) => {
  const loginUrl = new URL("/login", request.url);

  if (error) {
    loginUrl.searchParams.set("error", error);
  }

  return NextResponse.redirect(loginUrl);
};

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();

    const supabase = createServerClient<Database>(supabaseUrl, supabasePublicKey, {
      cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({
            request,
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const pathname = request.nextUrl.pathname;
    const publicRoute = isPublicRoute(pathname);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (publicRoute) {
      if (pathname !== "/login" || !user) {
        return response;
      }

      const isSuperadmin = await isSuperadminProfile(supabase, user.id);
      if (isSuperadmin) {
        return NextResponse.redirect(new URL("/", request.url));
      }

      await supabase.auth.signOut({ scope: "local" });
      return redirectToLogin(request, SUPERADMIN_REQUIRED_ERROR_MESSAGE);
    }

    if (!user) {
      return redirectToLogin(request);
    }

    const isSuperadmin = await isSuperadminProfile(supabase, user.id);
    if (!isSuperadmin) {
      await supabase.auth.signOut({ scope: "local" });
      return redirectToLogin(request, SUPERADMIN_REQUIRED_ERROR_MESSAGE);
    }

    return response;
  } catch (error) {
    console.error("Auth proxy error:", error);

    if (isPublicRoute(request.nextUrl.pathname)) {
      return response;
    }

    return redirectToLogin(request, "Authentication check failed.");
  }
};
