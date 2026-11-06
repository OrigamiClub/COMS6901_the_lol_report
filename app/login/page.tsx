import { signInWithGoogleAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { getMissingAuthEnvVars } from "@/utils/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const missingEnvVars = getMissingAuthEnvVars();
  const isAuthConfigured = missingEnvVars.length === 0;

  return (
    <main className="page-shell flex min-h-screen items-center justify-center p-6 text-foreground">
      <div className="app-panel w-full max-w-md rounded-2xl p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
              Humor Study Stats
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
          </div>
          <ThemeToggle />
        </div>
        <p className="app-muted mt-2 text-sm">
          Sign in with a Google account that has superadmin access.
        </p>

        {params.error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {params.error}
          </p>
        ) : null}

        {!isAuthConfigured ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Google auth is not configured. Missing: {missingEnvVars.join(", ")}
          </p>
        ) : null}

        <form action={signInWithGoogleAction} className="mt-6">
          <button
            type="submit"
            disabled={!isAuthConfigured}
            className="app-button app-button-primary flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a6.48 6.48 0 0 1-2.21 3.31v2.77h3.57a10.83 10.83 0 0 0 3.28-8.09Z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77a6.45 6.45 0 0 1-3.71 1.06 6.28 6.28 0 0 1-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09A6.57 6.57 0 0 1 5.5 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84Z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84A6.28 6.28 0 0 1 12 5.38Z"
              />
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
