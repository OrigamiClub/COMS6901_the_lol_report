import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

type LegacyStudyVoteTimingPageProps = {
  searchParams: Promise<{
    studyId?: string;
    minVotes?: string;
  }>;
};

const parseStudyIdParam = (rawValue: string | undefined) => {
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const buildDestination = (studyId: number, minVotes: string | undefined) => {
  const trimmedMinVotes = minVotes?.trim();
  const searchParams = new URLSearchParams();
  if (trimmedMinVotes) {
    searchParams.set("minVotes", trimmedMinVotes);
  }

  const query = searchParams.toString();
  const pathname = `/study/${studyId}/vote-timing`;

  return query ? `${pathname}?${query}` : pathname;
};

export const dynamic = "force-dynamic";

export default async function LegacyStudyVoteTimingPage({
  searchParams,
}: LegacyStudyVoteTimingPageProps) {
  const params = await searchParams;
  const requestedStudyId = parseStudyIdParam(params.studyId);

  if (requestedStudyId !== null) {
    redirect(buildDestination(requestedStudyId, params.minVotes));
  }

  const supabase = await createClient();
  const { data: studies, error } = await supabase
    .from("studies")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Unable to load studies: ${error.message}`);
  }

  const defaultStudyId = studies?.[0]?.id ?? null;
  if (defaultStudyId === null) {
    redirect("/");
  }

  redirect(buildDestination(defaultStudyId, params.minVotes));
}
