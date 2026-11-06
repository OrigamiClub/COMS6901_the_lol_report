const SUPABASE_URL_ENV_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY_ENV_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_ANON_KEY_ENV_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_PUBLIC_KEY_LABEL =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY";
const GOOGLE_CLIENT_ID_ENV_VAR = "NEXT_PUBLIC_GOOGLE_CLIENT_ID";

const getTrimmedEnvValue = (envVar: string) => {
  const value = process.env[envVar];
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

export const getSupabasePublicKey = () =>
  getTrimmedEnvValue(SUPABASE_PUBLISHABLE_KEY_ENV_VAR) ??
  getTrimmedEnvValue(SUPABASE_ANON_KEY_ENV_VAR);

export const getSupabasePublicEnv = () => {
  const supabaseUrl = getTrimmedEnvValue(SUPABASE_URL_ENV_VAR);
  const supabasePublicKey = getSupabasePublicKey();

  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error(
      `Missing Supabase env vars. Set ${SUPABASE_URL_ENV_VAR} and ${SUPABASE_PUBLIC_KEY_LABEL}.`,
    );
  }

  return { supabaseUrl, supabasePublicKey };
};

export const getMissingAuthEnvVars = () => {
  const missingEnvVars: string[] = [];

  if (!getTrimmedEnvValue(SUPABASE_URL_ENV_VAR)) {
    missingEnvVars.push(SUPABASE_URL_ENV_VAR);
  }

  if (!getSupabasePublicKey()) {
    missingEnvVars.push(SUPABASE_PUBLIC_KEY_LABEL);
  }

  if (!getTrimmedEnvValue(GOOGLE_CLIENT_ID_ENV_VAR)) {
    missingEnvVars.push(GOOGLE_CLIENT_ID_ENV_VAR);
  }

  return missingEnvVars;
};
