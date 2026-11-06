import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

type LegacyStudyDetailPageProps = {
  searchParams: Promise<{
    studyId?: string;
    minVoteSeconds?: string;
    maxVoteSeconds?: string;
    minVoteMs?: string;
    maxVoteMs?: string;
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

const buildDestination = (
  studyId: number,
  minVoteSeconds: string | undefined,
  maxVoteSeconds: string | undefined,
  minVoteMs: string | undefined,
  maxVoteMs: string | undefined,
) => {
  const trimmedMinVoteSeconds = minVoteSeconds?.trim();
  const trimmedMaxVoteSeconds = maxVoteSeconds?.trim();
  const trimmedMinVoteMs = minVoteMs?.trim();
  const trimmedMaxVoteMs = maxVoteMs?.trim();
  const nextSearchParams = new URLSearchParams();

  if (trimmedMinVoteSeconds) {
    nextSearchParams.set("minVoteSeconds", trimmedMinVoteSeconds);
  }

  if (trimmedMaxVoteSeconds) {
    nextSearchParams.set("maxVoteSeconds", trimmedMaxVoteSeconds);
  }

  if (trimmedMinVoteMs) {
    nextSearchParams.set("minVoteMs", trimmedMinVoteMs);
  }

  if (trimmedMaxVoteMs) {
    nextSearchParams.set("maxVoteMs", trimmedMaxVoteMs);
  }

  const query = nextSearchParams.toString();
  const pathname = `/study/${studyId}/study-detail`;

  return query ? `${pathname}?${query}` : pathname;
};

export const dynamic = "force-dynamic";

export default async function LegacyStudyDetailPage({
  searchParams,
}: LegacyStudyDetailPageProps) {
  const params = await searchParams;
  const requestedStudyId = parseStudyIdParam(params.studyId);

  if (requestedStudyId !== null) {
    redirect(
      buildDestination(
        requestedStudyId,
        params.minVoteSeconds,
        params.maxVoteSeconds,
        params.minVoteMs,
        params.maxVoteMs,
      ),
    );
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

  redirect(
    buildDestination(
      defaultStudyId,
      params.minVoteSeconds,
      params.maxVoteSeconds,
      params.minVoteMs,
      params.maxVoteMs,
    ),
  );
}
