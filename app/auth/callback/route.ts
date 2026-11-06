import { NextRequest, NextResponse } from "next/server";

import {
  isSuperadminProfile,
  SUPERADMIN_REQUIRED_ERROR_MESSAGE,
} from "@/utils/supabase/superadmin";
import { createClient } from "@/utils/supabase/server";

const FALLBACK_SITE_URL = "http://localhost:3005";

const getConfiguredSiteOrigin = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    return null;
  }

  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
};

const getRequestOrigin = (request: NextRequest) => {
  const configuredSiteOrigin = getConfiguredSiteOrigin();
  if (configuredSiteOrigin) {
    return configuredSiteOrigin;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    (forwardedHost?.includes("localhost") ? "http" : "https");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return FALLBACK_SITE_URL;
};

const buildLoginRedirect = (origin: string, error: string) => {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  return url;
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = getRequestOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const safeNext = next?.startsWith("/") ? next : "/";

  if (!code) {
    return NextResponse.redirect(
      buildLoginRedirect(redirectOrigin, "Missing auth code."),
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      buildLoginRedirect(redirectOrigin, exchangeError.message),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(
      buildLoginRedirect(redirectOrigin, "Unable to fetch authenticated user."),
    );
  }

  const isSuperadmin = await isSuperadminProfile(supabase, user.id);
  if (!isSuperadmin) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(
      buildLoginRedirect(redirectOrigin, SUPERADMIN_REQUIRED_ERROR_MESSAGE),
    );
  }

  return NextResponse.redirect(new URL(safeNext, redirectOrigin));
}
