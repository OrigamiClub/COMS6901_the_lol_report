# AGENTS.md

## Project Overview
- Project: `the-lol-report`
- Current status: Next.js App Router scaffold with Supabase Google auth + `profiles.is_superadmin` route protection.
- Goal: build a modern Next.js app with Tailwind CSS and Supabase-backed data/auth.

## Current Stack
- Next.js `16.1.6`
- React `19.2.4`
- TypeScript `^5`
- Tailwind CSS `^4` with `@tailwindcss/postcss`
- Recharts `^3.8.0`
- ESLint `^9` with `eslint-config-next`

## Repository Layout
- `app/`: App Router pages and layout.
- `app/login/page.tsx`: Google-only login route (public).
- `app/auth/callback/route.ts`: OAuth callback + `profiles.is_superadmin` gate.
- `app/reports/study-comparison/page.tsx`: Protected report page that compares two studies (`?studyA=<id>&studyB=<id>`) using caption coverage, vote-derived metrics, overlap counts, and deltas in an on-page comparison table.
- `app/reports/new-style-report/page.tsx`: Redirect helper that resolves a selected or latest study ID 7+ into the new study interface report route.
- `app/reports/study-detail/page.tsx`: Redirect helper that resolves a selected or latest study into the study detail route.
- `app/study/[id]/engagement-risk/page.tsx`: Protected report page that scores per-user participation risk for a selected study (`/study/<id>/engagement-risk?minVotes=<n>`) using voting speed/read-load, leave-one-out consensus agreement, vote monotony, and polarity extremity.
- `app/study/[id]/new-style-report/page.tsx`: Protected report page for the newer study interface used by study IDs 7+ (`/study/<id>/new-style-report?minUserNavigationEvents=<n>`), comparing `study_caption_navigation_events` against `study_caption_vote_events` for same-session vote coverage, skip rate, dwell timing, and user/caption breakdowns.
- `app/reports/weekly-study-summary/page.tsx`: Protected report page for weekly study analytics from `studies` + caption/vote mappings. Uses lightweight study-level aggregates to chart weighted score, caption volume, vote volume, and votes-per-caption across the loaded study window (`?limit=<n>`).
- `app/study/[id]/study-detail/page.tsx`: Protected report page that shows basic vote-level detail for one study (`/study/<id>/study-detail`), including overall vote totals, vote distribution, vote timing summary, and caption-level vote coverage.
- `app/study/[id]/vote-timing/page.tsx`: Protected report page that shows each user's elapsed first-vote-to-last-vote span for a selected study (`/study/<id>/vote-timing?minVotes=<n>`), with KPI cards and an on-page timing table.
- `app/study/[id]/user-upvote-rate/page.tsx`: Protected report page that shows per-user upvote percentage for a selected study (`/study/<id>/user-upvote-rate`), sorted by upvote percentage descending with user-level vote counts.
- `app/study/[id]/selected-user-report/page.tsx`: Protected report page that starts with no selected users and lets you add/remove profiles through a searchable modal to calculate a combined upvote percentage for only the chosen subset (`/study/<id>/selected-user-report?userId=<profile>&userId=<profile>`).
- `app/api/profile-search/route.ts`: Authenticated route handler used by the selected-user-report modal to search the `profiles` table by name, email, or id.
- `app/actions/auth.ts`: server actions for sign-in/sign-out.
- `utils/supabase/`: shared Supabase server/client/proxy helpers.
- `proxy.ts`: global route protection (Next.js 16 proxy).
- `amplify.yml`: AWS Amplify Hosting build spec for SSR deployment.
- `public/`: static assets.
- `next.config.ts`: Next.js config.
- `tsconfig.json`: TypeScript config.
- `eslint.config.mjs`: lint config.

## Local Development
1. Install dependencies:
```bash
npm install
```
2. Start dev server:
```bash
npm run dev
```
3. Production build:
```bash
npm run build
```
4. Run lint:
```bash
npm run lint
```

## Conventions
- Prefer Server Components by default in `app/`; add `'use client'` only when needed.
- Keep TypeScript strict and avoid `any` unless necessary.
- Store secrets in `.env.local`; never commit secrets.
- Use small, focused components and keep business logic out of page files when possible.

## Testing
- No test framework is configured yet.
- Add tests as features are introduced (unit + integration where appropriate).

## Setup and commands
- Required env vars in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; `NEXT_PUBLIC_SITE_URL` can be used for callback origin fallback.
- Google OAuth/Supabase redirect allowlists must include the deployed callback URLs (`https://stats.humorstudy.org/auth/callback`, `https://stats.slightlyhumorous.org/auth/callback`) plus the local callback URL for whichever dev port is used.
- OAuth callback redirects must prefer `NEXT_PUBLIC_SITE_URL` over request-derived origins because Amplify SSR can expose internal localhost origins in route handlers.
- Install/run: `npm install`, `npm run dev`; lint: `npm run lint`; build: `npm run build`.
- AWS hosting uses the committed `amplify.yml` build spec plus console-managed Amplify GitHub App connections. Staging is `the-lol-report-staging` from the `staging` branch to `stats.slightlyhumorous.org`; production is `the-lol-report-production` from `main` to `stats.humorstudy.org`. Setup notes live in `README.md`.
- Public routes: `/login` and `/auth/callback`; all others require an authenticated user whose matching `profiles` row has `is_superadmin = true`.

## Authentication sessions
- Auth cookies are scoped to this app and Supabase project using `getSupabaseAuthCookieOptions`; browser, server, and proxy clients must use the same options.
- Ordinary logout and auth cleanup use `signOut({ scope: "local" })` so other apps remain signed in.
- Existing shared auth cookies are not imported; users sign in once per app after this change.

## Supabase schema
- The latest database types live in src/types/supabase.ts
- This is generated by running npm run supabase:types
- The user does not want to use a SUPABASE_ROLE_KEY.  All actions should use the logged-in user's JWT key.

## Conventions and reminders
- Use the shared Supabase client helpers (`createClient`) for server/client contexts instead of instantiating ad hoc.
- Update the public route allowlist in `utils/supabase/proxy.ts` whenever adding unauthenticated pages.
- Tailwind v4 uses CSS-driven tokens; add design tokens in `src/app/globals.css` rather than a config file.
- Do not crop caption images—render them fully (object-contain) and adjust layout instead of cutting off any part of the image.
- COMMANDMENT: Caption text must sit immediately under its image with nothing in between. No badges/pills/buttons may intrude.
- COMMANDMENT: Never let UI overlap—avoid stacking divs so badges, buttons, or bars cover image or caption.
- COMMANDMENT: Before finishing work, run `npm run build` and resolve build errors.
- Keep this doc updated when adding routes, changing auth flow, or adjusting environment requirements.
