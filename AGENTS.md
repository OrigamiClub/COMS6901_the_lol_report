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
- d3-force `^3` (participant network layout)
- ESLint `^9` with `eslint-config-next`

## Repository Layout
- `app/`: App Router pages and layout.
- `app/login/page.tsx`: Google-only login route (public).
- `app/auth/callback/route.ts`: OAuth callback + `profiles.is_superadmin` gate.
- `app/reports/study-comparison/page.tsx`: Protected report page that compares two studies (`?studyA=<id>&studyB=<id>`) using caption coverage, vote-derived metrics, overlap counts, and deltas in an on-page comparison table.
- `app/reports/new-style-report/page.tsx`: Redirect helper that resolves a selected or latest study ID 7+ into the new study interface report route.
- `app/reports/study-detail/page.tsx`: Redirect helper that resolves a selected or latest study into the study detail route.
- `app/study/[id]/engagement-risk/page.tsx`: Protected report page that scores per-user participation risk for a selected study (`/study/<id>/engagement-risk?minVotes=<n>`) using voting speed/read-load, leave-one-out consensus agreement, vote monotony, and polarity extremity.
- `app/study/[id]/new-style-report/page.tsx`: Protected report page for the newer study interface used by study IDs 7+ (`/study/<id>/new-style-report?minUserNavigationEvents=<n>`), comparing `study_caption_navigation_events` against `study_caption_vote_events` for same-session vote coverage, skip rate, dwell timing, and user/caption breakdowns, plus a like-rate heatmap by AI humor style × image subject (`components/humor-tag-heatmap.tsx`, anchor `#humor-tag-heatmap`) using distinct viewers/likers per caption and the latest tagging run covering the study; clicking a cell lists that cell's memes (image + caption + like rate) below the grid. Also a participant network (`components/like-overlap-graph.tsx`, `d3-force` layout, anchor `#like-overlap-graph`): each participant (with at least a minimum number of likes, default 5) is linked to their k closest matches (default 3) by similarity (shared likes ÷ captions either liked) or raw shared-like count; groups come from Louvain clustering (`utils/like-graph/louvain.ts`), the three largest colored with `--graph-group-*` tokens, each summarized by the humor style and captions it over-likes; clicking a group highlights it. A Layout toggle switches between "By group" (default: each group pulled to its own anchor on a ring, labeled, cross-group lines faded) and "Free" (positions from the lines alone).
- `app/reports/weekly-study-summary/page.tsx`: Protected report page for weekly study analytics from `studies` + caption/vote mappings. Uses lightweight study-level aggregates to chart weighted score, caption volume, vote volume, and votes-per-caption across the loaded study window (`?limit=<n>`).
- `app/study/[id]/study-detail/page.tsx`: Protected report page that shows basic vote-level detail for one study (`/study/<id>/study-detail`), including overall vote totals, vote distribution, vote timing summary, and caption-level vote coverage.
- `app/study/[id]/vote-timing/page.tsx`: Protected report page that shows each user's elapsed first-vote-to-last-vote span for a selected study (`/study/<id>/vote-timing?minVotes=<n>`), with KPI cards and an on-page timing table.
- `app/study/[id]/user-upvote-rate/page.tsx`: Protected report page that shows per-user upvote percentage for a selected study (`/study/<id>/user-upvote-rate`), sorted by upvote percentage descending with user-level vote counts.
- `app/study/[id]/selected-user-report/page.tsx`: Protected report page that starts with no selected users and lets you add/remove profiles through a searchable modal to calculate a combined upvote percentage for only the chosen subset (`/study/<id>/selected-user-report?userId=<profile>&userId=<profile>`).
- `components/study-header-actions.tsx`: Shared header buttons on every `/study/<id>/...` page and on `/tagging?studyId=<id>`, linking back to that study's main page (`/study/<id>/new-style-report` for study 7+, `/study/<id>/study-detail` for older studies), its humor-tags report, the tagging page pre-scoped to the study, and Home (the current page's own link is hidden).
- `app/tagging/page.tsx` + `app/tagging/actions.ts`: Protected admin page for AI meme tagging. Drafts subject-matter (image) and humor-style (caption) taxonomies with Gemini, lets superadmins edit/approve tags, and runs batched tagging into `image_meme_tags` / `caption_meme_tags`, either over every study or scoped to one study (`meme_tagging_runs.study_id`; `?studyId=<id>` pre-selects the scope). Logic lives in `utils/meme-tagging/`.
- `app/study/[id]/humor-tags/page.tsx`: Protected report page comparing outcomes for one study (`/study/<id>/humor-tags`) by each caption's primary AI humor-style tag and its image's primary subject tag. Shows like rate (same-session liked views ÷ `study_caption_navigation_events` views, matching the new-style report) when view data exists, and upvote rate/vote distribution only when the study recorded more than one vote value; using the latest completed tagging run that covers that study (scoped to it or to all studies).
- `app/api/profile-search/route.ts`: Authenticated route handler used by the selected-user-report modal to search the `profiles` table by name, email, or id.
- `app/actions/auth.ts`: server actions for sign-in/sign-out.
- `utils/supabase/`: shared Supabase server/client/proxy helpers.
- `utils/like-graph/louvain.ts`: deterministic Louvain community detection used by the participant network.
- `utils/meme-tagging/`: AI tagging schemas, prompts (`PROMPT_VERSION`), Gemini calls, Supabase queries, batch runner, and humor-tags report aggregation.
- `supabase/migrations/`: SQL migrations applied to the loldb project (`hcyvpvfiraidvefsnveo`).
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
- Required env vars in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; `NEXT_PUBLIC_SITE_URL` can be used for callback origin fallback. Optional server-only `GOOGLE_GENERATIVE_AI_API_KEY` enables AI meme tagging; `MEME_TAGGING_MODEL` overrides the default `gemini-3.8-flash`.
- Google OAuth/Supabase redirect allowlists must include the deployed callback URLs (`https://stats.humorstudy.org/auth/callback`, `https://stats.slightlyhumorous.org/auth/callback`) plus the local callback URL for whichever dev port is used.
- OAuth callback redirects must prefer `NEXT_PUBLIC_SITE_URL` over request-derived origins because Amplify SSR can expose internal localhost origins in route handlers.
- Install/run: `npm install`, `npm run dev`; lint: `npm run lint`; build: `npm run build`.
- AWS hosting uses the committed `amplify.yml` build spec plus console-managed Amplify GitHub App connections. Staging is `the-lol-report-staging` from the `staging` branch to `stats.slightlyhumorous.org`; production is `the-lol-report-production` from `main` to `stats.humorstudy.org`. Setup notes live in `README.md`.
- Public routes: `/login` and `/auth/callback`; all others require an authenticated user whose matching `profiles` row has `is_superadmin = true`.
- To pre-approve a superadmin who hasn't signed in yet, insert their lowercase email into `superadmin_email_invites`; `handle_new_user()` (on `auth.users` insert) creates their profile with `is_superadmin = true` on first sign-in and stamps `accepted_datetime_utc`. Existing users are promoted by updating `profiles.is_superadmin` directly.

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
