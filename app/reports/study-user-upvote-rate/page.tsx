import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

type LegacyStudyUserUpvoteRatePageProps = {
  searchParams: Promise<{
    studyId?: string;
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

export const dynamic = "force-dynamic";

export default async function LegacyStudyUserUpvoteRatePage({
  searchParams,
}: LegacyStudyUserUpvoteRatePageProps) {
  const params = await searchParams;
  const requestedStudyId = parseStudyIdParam(params.studyId);

  if (requestedStudyId !== null) {
    redirect(`/study/${requestedStudyId}/user-upvote-rate`);
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

  redirect(`/study/${defaultStudyId}/user-upvote-rate`);
}
