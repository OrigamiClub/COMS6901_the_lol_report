"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getMissingAuthEnvVars } from "@/utils/supabase/env";
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

const getOrigin = async () => {
  const configuredSiteOrigin = getConfiguredSiteOrigin();
  if (configuredSiteOrigin) {
    return configuredSiteOrigin;
  }

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol =
    headersList.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return FALLBACK_SITE_URL;
};

export const signInWithGoogleAction = async () => {
  const missingEnvVars = getMissingAuthEnvVars();
  if (missingEnvVars.length > 0) {
    redirect(
      `/login?error=${encodeURIComponent(
        `Missing env vars: ${missingEnvVars.join(", ")}`,
      )}`,
    );
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    const message = error?.message ?? "Unable to start Google sign in.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  redirect(data.url);
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
};
