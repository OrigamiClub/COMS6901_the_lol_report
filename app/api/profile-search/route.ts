import type { NextRequest } from "next/server";

import type { Tables } from "@/src/types/supabase";
import { createClient } from "@/utils/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type ProfileSearchRow = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "last_name">;

const parseLimit = (rawValue: string | null) => {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

const normalizeSearchQuery = (rawValue: string | null) =>
  (rawValue ?? "")
    .trim()
    .slice(0, 60)
    .replace(/[^a-zA-Z0-9@._ -]/g, " ")
    .replace(/\s+/g, " ");

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getProfileLabel = (profile: ProfileSearchRow) => {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  if (profile.email) {
    return profile.email;
  }

  return `User ${profile.id.slice(0, 8)}`;
};

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const compareNullableStrings = (left: string | null, right: string | null) => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return compareStrings(left, right);
};

export async function GET(request: NextRequest) {
  const query = normalizeSearchQuery(request.nextUrl.searchParams.get("q"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (query.length < 2) {
    return Response.json({ results: [] });
  }

  const terms = query
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 4);
  const orClauses = terms.flatMap((term) => {
    const wildcardTerm = `*${term}*`;

    return [
      `email.ilike.${wildcardTerm}`,
      `first_name.ilike.${wildcardTerm}`,
      `last_name.ilike.${wildcardTerm}`,
    ];
  });

  if (isUuidLike(query)) {
    orClauses.push(`id.eq.${query}`);
  }

  if (orClauses.length === 0) {
    return Response.json({ results: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .or(orClauses.join(","))
    .limit(limit);

  if (error) {
    return Response.json(
      { error: `Unable to search profiles: ${error.message}` },
      { status: 500 },
    );
  }

  const results = (data ?? [])
    .map((profile) => ({
      profile_id: profile.id,
      user_label: getProfileLabel(profile),
      email: profile.email,
    }))
    .sort((left, right) => {
      const labelComparison = compareStrings(left.user_label, right.user_label);
      if (labelComparison !== 0) {
        return labelComparison;
      }

      const emailComparison = compareNullableStrings(left.email, right.email);
      if (emailComparison !== 0) {
        return emailComparison;
      }

      return compareStrings(left.profile_id, right.profile_id);
    });

  return Response.json({ results });
}
