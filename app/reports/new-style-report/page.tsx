import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

const NEW_STYLE_MIN_STUDY_ID = 7;

type LegacyNewStyleReportPageProps = {
  searchParams: Promise<{
    studyId?: string;
    minUserNavigationEvents?: string;
  }>;
};

const parseStudyIdParam = (rawValue: string | undefined) => {
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < NEW_STYLE_MIN_STUDY_ID) {
    return null;
  }

  return parsed;
};

const buildDestination = (studyId: number, minUserNavigationEvents: string | undefined) => {
  const trimmedMinUserNavigationEvents = minUserNavigationEvents?.trim();
  const searchParams = new URLSearchParams();
  if (trimmedMinUserNavigationEvents) {
    searchParams.set("minUserNavigationEvents", trimmedMinUserNavigationEvents);
  }

  const query = searchParams.toString();
  const pathname = `/study/${studyId}/new-style-report`;

  return query ? `${pathname}?${query}` : pathname;
};

export const dynamic = "force-dynamic";

export default async function LegacyNewStyleReportPage({
  searchParams,
}: LegacyNewStyleReportPageProps) {
  const params = await searchParams;
  const requestedStudyId = parseStudyIdParam(params.studyId);

  if (requestedStudyId !== null) {
    redirect(buildDestination(requestedStudyId, params.minUserNavigationEvents));
  }

  const supabase = await createClient();
  const { data: studies, error } = await supabase
    .from("studies")
    .select("id")
    .gte("id", NEW_STYLE_MIN_STUDY_ID)
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Unable to load new style studies: ${error.message}`);
  }

  const defaultStudyId = studies?.[0]?.id ?? null;
  if (defaultStudyId === null) {
    redirect("/");
  }

  redirect(buildDestination(defaultStudyId, params.minUserNavigationEvents));
}
